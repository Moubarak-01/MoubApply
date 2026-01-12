import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

/**
 * Audio Transcription Service
 * 
 * Uses Groq's Whisper API for high-quality audio transcription.
 * This serves as a backup when browser's Web Speech API is unavailable.
 */

interface TranscriptionResult {
    text: string;
    duration?: number;
}

/**
 * Transcribe audio file using Groq Cloud API
 * @param audioFilePath - Path to the audio file
 * @returns Transcribed text
 */
export const transcribeWithGroq = async (audioFilePath: string): Promise<TranscriptionResult> => {
    const groqApiKey = process.env.GROQ_API_KEY;
    
    if (!groqApiKey) {
        throw new Error('GROQ_API_KEY is not defined in .env file');
    }

    if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    const formData = new FormData();
    const audioStream = fs.createReadStream(audioFilePath);
    const filename = path.basename(audioFilePath);
    
    formData.append('file', audioStream, {
        filename: filename,
        contentType: getContentType(filename)
    });
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'json');
    formData.append('language', 'en');

    try {
        console.log(`🎤 Transcribing audio with Groq Whisper: ${filename}`);
        
        const response = await axios.post(
            'https://api.groq.com/openai/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${groqApiKey}`,
                    ...formData.getHeaders()
                },
                timeout: 60000, // 60 second timeout for large files
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        const result: TranscriptionResult = {
            text: response.data.text || '',
            duration: response.data.duration
        };

        console.log(`✅ Transcription complete: "${result.text.substring(0, 50)}..."`);
        return result;

    } catch (error: any) {
        if (error.response?.status === 429) {
            console.error('❌ Groq API rate limited. Please try again later.');
            throw new Error('Transcription rate limited. Please try again in a moment.');
        }
        
        if (error.response?.status === 401) {
            console.error('❌ Groq API key invalid or expired.');
            throw new Error('Transcription service authentication failed.');
        }

        console.error('❌ Groq Transcription Error:', error.response?.data || error.message);
        throw new Error(`Transcription failed: ${error.message}`);
    }
};

/**
 * Get MIME content type from filename extension
 */
const getContentType = (filename: string): string => {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.webm': 'audio/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/m4a',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac'
    };
    return mimeTypes[ext] || 'audio/webm';
};

/**
 * Transcribe audio buffer directly (for in-memory audio)
 * @param audioBuffer - Audio data as Buffer
 * @param mimeType - MIME type of the audio
 * @returns Transcribed text
 */
export const transcribeBuffer = async (audioBuffer: Buffer, mimeType: string = 'audio/webm'): Promise<TranscriptionResult> => {
    const groqApiKey = process.env.GROQ_API_KEY;
    
    if (!groqApiKey) {
        throw new Error('GROQ_API_KEY is not defined in .env file');
    }

    const formData = new FormData();
    
    // Determine file extension from MIME type
    const extMap: Record<string, string> = {
        'audio/webm': '.webm',
        'audio/mpeg': '.mp3',
        'audio/wav': '.wav',
        'audio/m4a': '.m4a',
        'audio/ogg': '.ogg'
    };
    const ext = extMap[mimeType] || '.webm';
    
    formData.append('file', audioBuffer, {
        filename: `recording${ext}`,
        contentType: mimeType
    });
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'json');
    formData.append('language', 'en');

    try {
        console.log(`🎤 Transcribing audio buffer with Groq Whisper...`);
        
        const response = await axios.post(
            'https://api.groq.com/openai/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${groqApiKey}`,
                    ...formData.getHeaders()
                },
                timeout: 60000
            }
        );

        const result: TranscriptionResult = {
            text: response.data.text || '',
            duration: response.data.duration
        };

        console.log(`✅ Buffer transcription complete: "${result.text.substring(0, 50)}..."`);
        return result;

    } catch (error: any) {
        console.error('❌ Groq Buffer Transcription Error:', error.response?.data || error.message);
        throw new Error(`Transcription failed: ${error.message}`);
    }
};
