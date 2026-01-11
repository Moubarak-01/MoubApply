import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Application, ApplicationStatus } from './models/Application.schema';
import { Job } from './models/Job.schema';
import { User } from './models/User.schema';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('MONGO_URI is not defined in .env file');
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
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