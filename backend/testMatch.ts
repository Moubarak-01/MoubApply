import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Job } from './models/Job.schema';
import { User } from './models/User.schema';
import { enrichJobWithAI } from './services/aiMatcher';

dotenv.config();

const testMatch = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI not found');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const job = await Job.findOne({ matchScore: 0 });
    const user = await User.findOne();

    if (!job) {
      console.log('No jobs found with matchScore 0');
      process.exit(0);
    }
    if (!user) {
      console.error('No user found');
      process.exit(1);
    }

    console.log(`Matching Job: ${job.title} (${job._id})`);
    console.log(`For User: ${user.name} (${user._id})`);
    
    const updatedJob = await enrichJobWithAI(job._id.toString(), user._id.toString());
    
    console.log('--- Match Result ---');
    console.log(`Score: ${updatedJob.matchScore}`);
    console.log(`Why: ${updatedJob.aiSummary.whyYouWillLoveIt}`);
    console.log(`Catch: ${updatedJob.aiSummary.theCatch}`);
    console.log(`Skills: ${updatedJob.aiSummary.topSkills.join(', ')}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Test Match Error:', error);
    process.exit(1);
  }
};

testMatch();
