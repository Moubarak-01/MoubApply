// @ts-nocheck
// Local Whisper Transcription Server using Xenova Transformers
// Disable strict type checking for compatibility with mixed ESM/CJS packages

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { pipeline } = require('@xenova/transformers');
const { WaveFile } = require('wavefile');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const os = require('os');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = 3001; // Different port from main backend (5000)

// Increase payload limit for safety
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

let transcriber: any = null;
let processingQueue: any[] = [];
let isProcessing = false;

console.log("⏳ Loading Local Whisper Model (English-Only Tiny)...");

const initModel = async () => {
    try {
        // Uses 'Xenova/whisper-tiny.en' for speed (English Only)
        // This is the fastest possible model for laptop use
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
            quantized: true,
        });
        console.log("✅ Local Whisper Ready! (English Only + Queue Active)");
    } catch (error) {
        console.error("❌ Failed to load Whisper model:", error);
    }
};
initModel();

// The Queue Processor
const processQueue = async () => {
    if (isProcessing || processingQueue.length === 0) return;

    isProcessing = true;
    const { req, res, tempInput, tempOutput } = processingQueue.shift();

    try {
        // 1. Write File
        fs.writeFileSync(tempInput, req.file.buffer);

        // 2. Convert to WAV (Fastest settings)
        await new Promise<void>((resolve, reject) => {
            ffmpeg(tempInput)
                .toFormat('wav')
                .audioChannels(1)
                .audioFrequency(16000)
                .on('end', resolve)
                .on('error', reject)
                .save(tempOutput);
        });

        // 3. Read WAV
        const wavBuffer = fs.readFileSync(tempOutput);
        let wav = new WaveFile(wavBuffer);
        wav.toBitDepth('32f');
        let audioData: any = wav.getSamples();

        if (Array.isArray(audioData)) {
            if (audioData.length > 1) {
                // If stereo, mix to mono
                const mono = new Float32Array(audioData[0].length);
                for (let i = 0; i < audioData[0].length; i++) {
                    mono[i] = (audioData[0][i] + audioData[1][i]) / 2;
                }
                audioData = mono;
            } else {
                audioData = audioData[0];
            }
        }

        // 4. Transcribe
        const result = await transcriber(audioData);
        console.log(`✅ Local transcription: "${result.text.trim()}"`);

        // 5. Cleanup temp files
        try { fs.unlinkSync(tempInput); } catch (e) { }
        try { fs.unlinkSync(tempOutput); } catch (e) { }

        // Send Result
        res.json({ text: result.text.trim() });

    } catch (error: any) {
        console.error("❌ Local Transcription Error:", error);
        try { fs.unlinkSync(tempInput); } catch (e) { }
        try { fs.unlinkSync(tempOutput); } catch (e) { }
        res.status(500).json({ error: error.message });
    } finally {
        isProcessing = false;
        // Immediate check for next item in queue
        setImmediate(processQueue);
    }
};

// OpenAI-compatible endpoint
app.post('/v1/audio/transcriptions', upload.single('file'), (req: any, res: any) => {
    if (!transcriber) {
        return res.status(503).json({ error: "Model is still loading. Please try again in a few seconds." });
    }
    if (!req.file) {
        return res.status(400).json({ error: "No audio file provided." });
    }

    console.log(`🎤 Received audio: ${req.file.size} bytes`);

    const requestId = Date.now() + Math.random();

    // Use system temp folder to avoid permission errors
    const tempInput = path.join(os.tmpdir(), `whisper_input_${requestId}`);
    const tempOutput = path.join(os.tmpdir(), `whisper_output_${requestId}.wav`);

    // Add to queue instead of processing immediately
    processingQueue.push({ req, res, tempInput, tempOutput });

    // Trigger processor
    processQueue();
});

// Health check endpoint
app.get('/health', (req: any, res: any) => {
    res.json({
        status: transcriber ? 'ready' : 'loading',
        model: 'whisper-tiny.en',
        queue: processingQueue.length
    });
});

app.listen(port, () => {
    console.log(`🚀 Local Whisper API running at http://localhost:${port}`);
    console.log(`   Endpoint: POST /v1/audio/transcriptions`);
});

// Debug: Catch any reason for process exit
process.on('exit', (code) => {
    console.log(`⚠️ Process exit with code: ${code}`);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Keep-alive: Prevent Node from exiting if event loop is empty
setInterval(() => {
    // This keeps the process alive
}, 1000 * 60 * 60); // Every hour (just to keep event loop active)
