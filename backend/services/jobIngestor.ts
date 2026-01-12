import axios from 'axios';
import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';
import { enrichJobWithAI } from './aiMatcher';

const COMPANY_TOKENS = [
  'notion', 'figma', 'stripe', 'airbnb', 'uber', 'pinterest', 
  'coinbase', 'mongodb', 'datadog', 'robinhood', 'snapchat', 'doordash', 'lyft'
];

const ROLE_KEYWORDS = [
  'Software', 'Engineer', 'Developer', 'AI', 'Artificial Intelligence', 
  'Machine Learning', 'Data Science', 'Backend'
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ingests jobs from Greenhouse boards for specific high-tier tech companies.
 * Filters for tech internships based on title keywords.
 */
export const ingestJobs = async (userId?: string, query?: string) => {
  console.log("🔍 Starting Universal Greenhouse Job Ingestion...");
  
  let totalNewJobs = 0;
  
  // Try to find a valid user for matching
  let matchingUser = null;
  if (userId) {
      matchingUser = await User.findById(userId);
  }
  if (!matchingUser) {
      matchingUser = await User.findOne({ masterResumeText: { $exists: true, $ne: "" } });
  }

  for (const token of COMPANY_TOKENS) {
    try {
      console.log(`🏢 [Greenhouse] Processing: ${token.toUpperCase()}...`);
      const response = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
      const ghJobs = response.data.jobs || [];
      
      for (const ghJob of ghJobs) {
        const title = ghJob.title;
        const lowerTitle = title.toLowerCase();

        // Smart Filtering: (Intern OR Internship) AND (Software OR AI OR ML OR Data Science)
        const isInternship = lowerTitle.includes('intern') || lowerTitle.includes('internship');
        const matchesTech = ROLE_KEYWORDS.some(k => lowerTitle.includes(k.toLowerCase()));
        
        // If a specific query is provided, prioritize it, otherwise use default filter
        const queryMatch = query ? lowerTitle.includes(query.toLowerCase()) : (isInternship && matchesTech);

        if (!queryMatch) continue;

        // Deduplication (using Greenhouse ID)
        const existingJob = await Job.findOne({ externalId: ghJob.id.toString() });
        if (existingJob) continue;

        try {
            const newJob = new Job({
              title: title,
              company: token.charAt(0).toUpperCase() + token.slice(1),
              rawDescription: ghJob.content || 'No description provided.',
              applyLink: ghJob.absolute_url,
              externalId: ghJob.id.toString(),
              matchScore: 0,
              tags: [
                ghJob.location?.name || 'Global',
                'Internship',
                'Greenhouse'
              ],
              gradYearReq: 2026,
              aiSummary: {
                whyYouWillLoveIt: '',
                theCatch: '',
                topSkills: [],
              },
            });

            await newJob.save();
            totalNewJobs++;

            // Trigger AI Match immediately if user has a resume
            if (matchingUser && matchingUser.masterResumeText) {
                console.log(`🤖 Auto-matching: ${title} @ ${newJob.company}`);
                // Rate Limit Protection: sleep 3 seconds between AI calls
                await sleep(3000);
                await enrichJobWithAI(newJob._id.toString(), matchingUser._id.toString()).catch((err) => {
                    console.error(`❌ AI match failed for ${title}:`, err.message);
                });
            }
        } catch (saveErr: any) {
            if (saveErr.code === 11000) {
                console.log(`ℹ️ Job already exists: ${title}`);
            } else {
                console.error(`❌ Failed to save job ${title}:`, saveErr.message);
            }
        }
      }
      console.log(`✅ ${token.toUpperCase()} finished.`);
    } catch (error: any) {
      console.error(`❌ Failed to process company ${token}:`, error.message);
    }
  }

  return {
    message: `Ingestion complete. Found ${totalNewJobs} new tech internships.`,
    newJobs: totalNewJobs
  };
};