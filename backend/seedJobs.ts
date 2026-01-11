import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Job } from './models/Job.schema';
import { User } from './models/User.schema';

dotenv.config();

const MOCK_JOBS = [
  {
    title: 'Software Engineer Intern',
    company: 'MongoDB',
    matchScore: 98,
    tags: ['Remote', 'Summer 2026', 'Go', 'React'],
    gradYearReq: 2026,
    rawDescription: 'Join our core database team. Experience with distributed systems is a plus.',
    aiSummary: {
        whyYouWillLoveIt: 'High impact role with modern tech stack.',
        theCatch: 'Strict return-to-office policy.',
        topSkills: ['Go', 'Distributed Systems', 'React']
    }
  },
  {
    title: 'Frontend Developer',
    company: 'Vercel',
    matchScore: 92,
    tags: ['Next.js', 'Remote', 'TypeScript'],
    gradYearReq: 2025,
    rawDescription: 'Build the future of the web. Deep understanding of React internals required.',
    aiSummary: {
        whyYouWillLoveIt: 'Work on cutting-edge web tech.',
        theCatch: 'Fast-paced environment.',
        topSkills: ['Next.js', 'React', 'TypeScript']
    }
  },
  {
    title: 'Product Design Intern',
    company: 'Linear',
    matchScore: 85,
    tags: ['Design System', 'Figma', 'Hybrid'],
    gradYearReq: 2026,
    rawDescription: 'Craft beautiful interfaces. Attention to detail is paramount.',
    aiSummary: {
        whyYouWillLoveIt: 'Design-centric culture.',
        theCatch: 'High bar for visual details.',
        topSkills: ['Figma', 'UI/UX', 'Prototyping']
    }
  },
   {
    title: 'Backend Engineer',
    company: 'Stripe',
    matchScore: 99,
    tags: ['Ruby', 'Payments', 'Infrastructure'],
    gradYearReq: 2026,
    rawDescription: 'Help increase the GDP of the internet.',
    aiSummary: {
        whyYouWillLoveIt: 'Massive scale challenges.',
        theCatch: 'Complex domain knowledge required.',
        topSkills: ['Ruby', 'API Design', 'System Architecture']
    }
  },
];

const DEFAULT_USER = {
  name: "Demo User",
  email: "demo@example.com",
  masterResumeText: "Experienced in React, Node.js, and Python. Looking for Summer 2026 internships.",
  gradYear: 2026,
  preferences: {
    location: "Remote" as "Remote" | "Hybrid" | "Onsite",
    minMatchScore: 80
  }
};

const seedJobs = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not defined in .env file');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB Atlas for seeding');

    // Clear existing data
    await Job.deleteMany({});
    await User.deleteMany({});
    console.log('Cleared existing jobs and users');

    // Insert new data
    const createdJobs = await Job.insertMany(MOCK_JOBS);
    const createdUser = await User.create(DEFAULT_USER);
    
    console.log('Successfully seeded jobs');
    console.log('Successfully seeded user');
    console.log('-----------------------------------');
    console.log('Valid User ID:', createdUser._id);
    console.log('Valid Job ID (Example):', createdJobs[0]._id);
    console.log('-----------------------------------');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding jobs:', error);
    process.exit(1);
  }
};

seedJobs();
