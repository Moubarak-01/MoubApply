// Polyfill for pdfjs-dist (used by pdf-parse) in Node environment
class MockDOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor() {}
}
// @ts-ignore
global.DOMMatrix = MockDOMMatrix;

import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
// Use require for pdf-parse-fork to avoid TS call signature issues and DOM errors
const pdf = require('pdf-parse-fork'); 
import mammoth from 'mammoth';
import axios from 'axios';
import { Application, ApplicationStatus } from './models/Application.schema';
import { Job } from './models/Job.schema';
import { User } from './models/User.schema';

import { enrichJobWithAI } from './services/aiMatcher';
import { ingestJobs } from './services/jobIngestor';
import { autoApply } from './services/autoApplier';
import { signup, login, getMe, deleteAccount } from './services/auth';
import { tailorResume } from './services/resumeTailor';
import { parseResumeToJSON } from './services/resumeParser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
// Serve uploaded files and generated PDFs statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/generated_pdfs', express.static(path.join(__dirname, 'generated_pdfs')));

// --- CONFIGURATION ---

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('MONGO_URI is not defined in .env file');
  process.exit(1);
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Save as: timestamp-originalName
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

// --- EPHEMERAL SESSION CLEANUP ---
const clearUploadsOnStart = async () => {
    const uploadDir = path.join(__dirname, 'uploads');
    const pdfDir = path.join(__dirname, 'generated_pdfs');
    
    [uploadDir, pdfDir].forEach(dir => {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach(file => {
                const filePath = path.join(dir, file);
                if (fs.lstatSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
            });
            console.log(`🧹 ${path.basename(dir)} directory cleared.`);
        } else {
            fs.mkdirSync(dir);
        }
    });

    // 2. Database Cleanup (REMOVED: Do not wipe user data on restart)
    /*
    try {
        await User.updateMany({}, { $set: { resumes: [], masterResumeText: "", structuredExperience: undefined } });
        console.log('🧹 User resumes reset in database.');
    } catch (e) {
        console.error("Cleanup failed", e);
    }
    */
};

mongoose.connect(mongoUri)
  .then(async () => {
      console.log('Connected to MongoDB Atlas');
      // Run cleanup after DB connection
      clearUploadsOnStart();
  })
  .catch((err) => console.error('MongoDB connection error:', err));


// --- API Routes ---

// Auth Routes
app.post('/api/auth/signup', signup);
app.post('/api/auth/login', login);
app.get('/api/auth/me', getMe);
app.post('/api/auth/delete-account', deleteAccount);

// Tailor Resume Route
app.post('/api/applications/:id/tailor', async (req: Request, res: Response): Promise<any> => {
    try {
        const applicationId = req.params.id as string;
        const application = await Application.findById(applicationId);
        if (!application) return res.status(404).json({ error: 'Application not found' });

        // Update status to Processing
        application.status = ApplicationStatus.PROCESSING;
        await application.save();

        // Run AI Tailoring
        const result = await tailorResume(application.userId.toString(), application.jobId.toString());
        
        // Save results
        application.tailoredPdfUrl = result.pdfUrl;
        application.coverLetter = result.coverLetter;
        application.status = ApplicationStatus.ACTION_NEEDED; // Move to Review state
        await application.save();

        res.json(application);
    } catch (error: any) {
        console.error('Tailoring Route Error:', error);
        res.status(500).json({ error: 'Failed to tailor resume' });
    }
});

// AI Assistant Chat Route (Streaming + Dynamic Model)
app.post('/api/ai/assistant', async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, message, model, context } = req.body;
        const selectedModel = model || 'mistralai/mistral-small-3.1-24b-instruct:free';
        console.log(`🤖 AI Request | Model: ${selectedModel} | User: ${userId}`);
        
        const user = await User.findById(userId);
        if (!user) {
            console.error("❌ User not found in DB");
            return res.status(404).json({ error: 'User not found' });
        }
        const resumeContext = user.masterResumeText 
            ? `USER RESUME CONTENT:\n${user.masterResumeText}` 
            : "USER RESUME CONTENT: (None uploaded yet)";

        const appStateContext = context ? `
            CURRENT APP STATE:
            - Recent Jobs: ${JSON.stringify(context.jobs || [])}
            - Recent Applications: ${JSON.stringify(context.applications || [])}
        ` : "";

        // SHARED SYSTEM INSTRUCTIONS (Ensures all models behave the same)
        const systemPrompt = `
            You are the AI Assistant for "MoubApply", a cutting-edge job application automation platform.
            
            CORE MISSION: Provide ultra-concise, high-utility answers. 
            
            DETAILED KNOWLEDGE BASE & NEW FEATURES:
            - Real-Time Discovery: The Discovery view now features a search bar to fetch REAL jobs from the JSearch API. Users can enter queries like "Frontend Developer" and pull live data.
            - Mandatory Onboarding: New users must upload a resume before accessing core features. A "Resume Required" overlay guides them to the Profile section.
            - Advanced Tailor & Prep: Uses AI to rewrite and format resumes into professional LaTeX. It features a robust fallback loop (Gemini -> Mistral -> Llama -> Qwen) to bypass rate limits or payment issues.
            - Robust Parsing: Our engine parses resumes into structured JSON and automatically fixes common LaTeX escaping errors.
            - Tracker & State Sync: The Tracker (Kanban board) is fully synced with the App state. The Assistant (you) always receives the latest jobs and application data in its context.
            - Auto-Apply: The "⚡" button uses a Playwright-powered background bot to automate form filling.
            - Clean Account Management: Users can permanently delete their accounts, which wipes all user data, database records, and physical resume files from the server.

            PRIORITY ORDER:
            1. Recent MoubApply Updates & Features
            2. Current App State (Jobs/Applications provided in context)
            3. User's Resume Content
            4. General Career/Technical Knowledge

            STRICT FORMATTING RULES:
            - NO PREAMBLES: Start the answer immediately. No "Sure!", "Here is...", or "I can help".
            - VISUAL CLARITY: Use tables for comparing data and bullet points for lists.
            - MATH: Use $...$ for inline and $$...$$ for blocks. Keep variables inline.
            - MAX CONCISENESS: If you can answer in 2 sentences, do not use 3.

            ${resumeContext}
            ${appStateContext}
        `;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const CHAT_MODELS = [
            selectedModel,
            'google/gemini-2.0-flash-exp:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'mistralai/mistral-small-3.1-24b-instruct:free'
        ];

        let streamSuccess = false;
        let lastChatError: any = null;

        for (const modelId of CHAT_MODELS) {
            if (streamSuccess) break;
            try {
                console.log(`🤖 AI Chat trying model: ${modelId}`);
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    {
                        model: modelId,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: message }
                        ],
                        stream: true,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                            'Content-Type': 'application/json',
                            'HTTP-Referer': 'https://moubapply.com',
                            'X-Title': 'MoubApply'
                        },
                        responseType: 'stream',
                        timeout: 10000
                    }
                );

                response.data.on('data', (chunk: Buffer) => {
                    streamSuccess = true;
                    const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                    for (const line of lines) {
                        if (line === 'data: [DONE]') {
                            res.write('data: [DONE]\n\n');
                            res.end();
                            return;
                        }
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.replace('data: ', '');
                            try {
                                const json = JSON.parse(jsonStr);
                                const content = json.choices[0]?.delta?.content || '';
                                if (content) {
                                    res.write(`data: ${JSON.stringify({ content })}\n\n`);
                                }
                            } catch (e) {}
                        }
                    }
                });

                // Wait for the stream to finish or fail
                await new Promise((resolve, reject) => {
                    response.data.on('end', resolve);
                    response.data.on('error', reject);
                });
                
                if (streamSuccess) break;

            } catch (err: any) {
                lastChatError = err;
                console.warn(`🤖 Model ${modelId} failed for chat: ${err.message}`);
                if (err.response?.status === 429) {
                    console.log("Rate limited, trying next model...");
                }
            }
        }

        if (!streamSuccess && !res.headersSent) {
            res.write(`data: ${JSON.stringify({ content: "I'm currently receiving too many requests. Please try again in a moment." })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }

    } catch (error: any) {
        console.error('❌ AI Assistant Error:', error.response?.data || error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'AI matching failed', details: error.message });
        } else {
            res.end();
        }
    }
});

// Delete Resume/File Route
app.delete('/api/user/files/:filename', async (req: Request, res: Response): Promise<any> => {
    try {
        const { filename } = req.params;
        const filenameStr = String(filename); // Ensure string
        
        const user = await User.findOne({ "resumes.filename": filenameStr });
        
        if (!user) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Remove from filesystem
        const filePath = path.join(__dirname, 'uploads', filenameStr);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove from DB
        user.resumes = user.resumes.filter(f => f.filename !== filenameStr);
        await user.save();

        res.json({ message: 'File deleted', files: user.resumes });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Auto-Apply Route
app.post('/api/applications/:id/apply', async (req: Request, res: Response): Promise<any> => {
    try {
        const applicationId = req.params.id as string;
        // Run in background (don't await) so UI doesn't freeze
        autoApply(applicationId).catch(err => console.error("Background apply error:", err));
        
        res.json({ message: 'Auto-apply process started' });
    } catch (error: any) {
        console.error('Error starting auto-apply:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Clear Jobs Route
app.delete('/api/jobs', async (req: Request, res: Response): Promise<any> => {
    try {
        await Job.deleteMany({});
        res.json({ message: 'All jobs cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear jobs' });
    }
});

let isIngesting = false;

// Ingest Jobs Route
app.post('/api/jobs/ingest', async (req: Request, res: Response): Promise<any> => {
    try {
        const { clearFirst, userId, query } = req.body;
        
        if (isIngesting) {
            return res.status(429).json({ error: 'Ingestion already in progress. Please wait.' });
        }

        isIngesting = true;

        if (clearFirst) {
            await Job.deleteMany({});
            console.log("🧹 Cleared jobs before ingestion.");
        }

        // Call ingestJobs asynchronously with userId and query
        ingestJobs(userId, query).then(result => {
            console.log("🟢 Async Ingestion Result:", result.message);
        }).catch(err => {
            console.error("🔴 Async Ingestion Error:", err.message);
        }).finally(() => {
            isIngesting = false;
        });

        res.json({ message: 'Greenhouse & Adzuna job ingestion started in the background.' });
    } catch (error: any) {
        console.error('Error starting job ingestion:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Upload Resume/File Route
app.post('/api/user/upload', upload.array('files', 6), async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.body.userId; 
        if (!userId) {
             return res.status(400).json({ error: 'userId is required' });
        }
        
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const user = await User.findById(userId);
        if (!user) {
             return res.status(404).json({ error: 'User not found' });
        }

        // Add new files to user record
        const newFiles = files.map(file => ({
            originalName: file.originalname,
            filename: file.filename,
            path: `/uploads/${file.filename}`,
            mimetype: file.mimetype,
            uploadedAt: new Date()
        }));

        if ((user.resumes?.length || 0) + newFiles.length > 6) {
             return res.status(400).json({ error: 'Cannot have more than 6 files. Please delete some first.' });
        }

        if (!user.resumes) user.resumes = [];
        user.resumes.push(...newFiles);

        // --- Parsing Logic (PDF, DOCX, TXT) ---
        let extractedText = '';
        let parseStatus = 'File saved, but text not readable.';

        const pdfFile = files.find(f => f.mimetype === 'application/pdf');
        const docxFile = files.find(f => f.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        const txtFile = files.find(f => f.mimetype === 'text/plain');

        if (pdfFile) {
            console.log(`Parsing PDF: ${pdfFile.originalname}`);
            const dataBuffer = fs.readFileSync(pdfFile.path);
            const data = await pdf(dataBuffer);
            extractedText = data.text;
            parseStatus = 'PDF parsed successfully.';
        } else if (docxFile) {
            console.log(`Parsing DOCX: ${docxFile.originalname}`);
            const result = await mammoth.extractRawText({ path: docxFile.path });
            extractedText = result.value;
            parseStatus = 'Word Document parsed successfully.';
        } else if (txtFile) {
            console.log(`Reading TXT: ${txtFile.originalname}`);
            extractedText = fs.readFileSync(txtFile.path, 'utf-8');
            parseStatus = 'Text file read successfully.';
        }

        if (extractedText) {
            user.masterResumeText = extractedText;
            console.log("Updated masterResumeText.");
            
            // --- AI STRUCTURED PARSING ---
            try {
                const structuredData = await parseResumeToJSON(extractedText);
                user.structuredExperience = structuredData;
                user.markModified('structuredExperience'); // Ensure Mongoose sees the change
                console.log("✅ AI successfully structured the user's career data.");
            } catch (err) {
                console.error("Failed to structure data:", err);
            }
        }
        
        const savedUser = await user.save();
        console.log(`👤 User data saved. Structured data present: ${!!savedUser.structuredExperience}`);

        res.json({ 
            message: 'Upload complete', 
            files: newFiles, 
            totalFiles: user.resumes,
            parseStatus: parseStatus
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

app.post('/api/jobs/:id/match', async (req: Request, res: Response): Promise<any> => {
    try {
        const jobId = req.params.id as string;
        
        let { userId } = req.body;
        
        // If no userId provided, find the default user from the database
        if (!userId) {
            const user = await User.findOne();
            if (user) {
                userId = user._id.toString();
            } else {
                return res.status(404).json({ error: 'No user found in database to match against' });
            }
        }

        const updatedJob = await enrichJobWithAI(jobId, userId);
        res.json(updatedJob);
    } catch (error: any) {
        console.error('Error triggering AI match:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

app.get('/api/applications', async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.query.userId;
        if (!userId) {
             return res.status(400).json({ error: 'userId query parameter is required' });
        }

        const applications = await Application.find({ userId })
            .populate('jobId') // Get the job details (company, title)
            .sort({ updatedAt: -1 });
            
        res.json(applications);
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/user', async (req: Request, res: Response): Promise<any> => {
    try {
        const user = await User.findOne();
        if (!user) {
            return res.status(404).json({ error: 'No user found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/applications', async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, jobId } = req.body;

    if (!userId || !jobId) {
      return res.status(400).json({ error: 'userId and jobId are required' });
    }

    // Use findOneAndUpdate with upsert to prevent duplicates
    const application = await Application.findOneAndUpdate(
      { userId, jobId },
      { $setOnInsert: { status: ApplicationStatus.QUEUED } },
      { upsert: true, new: true }
    );

    return res.status(201).json(application);
  } catch (error) {
    console.error('Error creating application:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});