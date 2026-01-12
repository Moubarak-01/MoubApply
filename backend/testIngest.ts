import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ingestJobs } from './services/jobIngestor';

dotenv.config();

const testIngest = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI not found');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Test ingestion with a specific query
    console.log('Testing Job Ingestion...');
    const result = await ingestJobs('Software Engineer Intern Remote');
    console.log('Ingestion Result:', result);
    
    process.exit(0);
  } catch (error) {
    console.error('Test Ingest Error:', error);
    process.exit(1);
  }
};

testIngest();
