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
import { signup, login, getMe } from './services/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    
    // 1. Clear File System
    if (fs.existsSync(uploadDir)) {
        fs.readdirSync(uploadDir).forEach(file => {
            const filePath = path.join(uploadDir, file);
            if (fs.lstatSync(filePath).isFile()) {
                fs.unlinkSync(filePath);
            }
        });
        console.log('🧹 Uploads directory cleared.');
    } else {
        fs.mkdirSync(uploadDir);
    }

    // 2. Clear Database References (Resumes only)
    try {
        await User.updateMany({}, { $set: { resumes: [], masterResumeText: "" } });
        console.log('🧹 User resumes reset in database.');
    } catch (e) {
        console.error("Cleanup failed", e);
    }
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

// AI Assistant Chat Route (Streaming + Dynamic Model)
app.post('/api/ai/assistant', async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, message, model } = req.body;
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

        // SHARED SYSTEM INSTRUCTIONS (Ensures all models behave the same)
        const systemPrompt = `
            You are the AI Assistant for "MoubApply". 
            
            CORE MISSION: Provide ultra-concise, high-utility answers. 
            
            KNOWLEDGE BASE:
            - Discovery: Swipe RIGHT to queue, LEFT to ignore.
            - Tracker: Kanban board (Queued -> Processing -> Applied).
            - Auto-Apply: "⚡" button uses Playwright bot to fill forms.
            - Profile: Users upload resumes (PDF/DOCX).
            - AI Matching: Analyze resumes vs jobs for 0-100% scores.

            PRIORITY ORDER:
            1. MoubApply App Features
            2. User's Resume Content
            3. General Career/Technical Knowledge

            STRICT FORMATTING RULES:
            - NO PREAMBLES: Start the answer immediately. No "Sure!", "Here is...", or "I can help".
            - VISUAL CLARITY: Use tables for comparing data and bullet points for lists.
            - MATH: Use $...$ for inline and $...$ for blocks. Keep variables inline.
            - MAX CONCISENESS: If you can answer in 2 sentences, do not use 3.

            ${resumeContext}
        `;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: selectedModel,
                messages: [
                    { role: 'system', content: systemPrompt }, // Enforce rules
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
                responseType: 'stream'
            }
        );

        response.data.on('data', (chunk: Buffer) => {
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

        response.data.on('end', () => res.end());
        response.data.on('error', () => res.end());

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

// Ingest Jobs Route
app.post('/api/jobs/ingest', async (req: Request, res: Response): Promise<any> => {
    try {
        const { query } = req.body;
        const searchQuery = query || 'Software Engineer Intern'; 
        
        const result = await ingestJobs(searchQuery);
        res.json(result);
    } catch (error: any) {
        console.error('Error ingesting jobs:', error);
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
        }
        
        await user.save();

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

    const newApplication = new Application({
      userId,
      jobId,
      status: ApplicationStatus.QUEUED,
    });

    const savedApplication = await newApplication.save();
    return res.status(201).json(savedApplication);
  } catch (error) {
    console.error('Error creating application:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});