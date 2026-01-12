import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';
import { enrichJobWithAI } from './aiMatcher';

const MOCK_COMPANIES = ['Airbnb', 'Stripe', 'Netflix', 'Vercel', 'Linear', 'Coinbase', 'DoorDash', 'Uber', 'Notion', 'Figma'];
const MOCK_ROLES = ['Frontend Engineer Intern', 'Backend Engineer Intern', 'Full Stack Intern', 'Software Engineer Intern', 'Product Engineering Intern'];
const MOCK_LOCATIONS = ['Remote', 'San Francisco, CA', 'New York, NY', 'Seattle, WA', 'Austin, TX'];

const generateMockDescription = (company: string, role: string) => {
  return `
    ${company} is looking for a ${role} to join our team for Summer 2026.
    
    About the Role:
    You will work directly with senior engineers to build features that impact millions of users. 
    We are looking for someone who is passionate about ${role.includes('Frontend') ? 'React and Design Systems' : 'distributed systems and API design'}.
    
    Requirements:
    - Currently pursuing a degree in CS or related field.
    - Experience with ${role.includes('Frontend') ? 'TypeScript, React, and CSS' : 'Node.js, Go, or Python'}.
    - Strong communication skills.
    
    Nice to have:
    - Previous internship experience.
    - Open source contributions.
  `;
};

export const ingestJobs = async (query: string) => {
  console.log(`Generating mock jobs for query: ${query}`);
  
  // Get default user for matching
  const user = await User.findOne();
  if (!user) console.warn("No user found for auto-matching.");

  let newJobsCount = 0;

  for (let i = 0; i < 5; i++) { // Generate 5 at a time
    const company = MOCK_COMPANIES[Math.floor(Math.random() * MOCK_COMPANIES.length)];
    const role = MOCK_ROLES[Math.floor(Math.random() * MOCK_ROLES.length)];
    const location = MOCK_LOCATIONS[Math.floor(Math.random() * MOCK_LOCATIONS.length)];
    
    // Create a deterministic title/company combo for deduplication
    const title = `${role} - Summer 2026`;
    
    // Deduplication
    const existingJob = await Job.findOne({
      title: title,
      company: company,
    });

    if (!existingJob) {
      const newJob = new Job({
        title: title,
        company: company,
        rawDescription: generateMockDescription(company, role),
        applyLink: `https://boards.greenhouse.io/${company.toLowerCase()}/jobs/${Math.floor(Math.random() * 1000000)}`, 
        matchScore: 0, 
        tags: [location, 'Summer 2026', 'Mock'],
        gradYearReq: 2026, 
        aiSummary: {
          whyYouWillLoveIt: '',
          theCatch: '',
          topSkills: [],
        },
      });

      await newJob.save();
      newJobsCount++;

      // AUTOMATIC AI MATCHING
      if (user) {
          try {
              console.log(`Auto-matching ${title}...`);
              await enrichJobWithAI(newJob._id.toString(), user._id.toString());
          } catch (err) {
              console.error(`Failed to auto-match job ${newJob._id}`, err);
          }
      }
    }
  }

  return { message: `Successfully generated and matched ${newJobsCount} new mock jobs.` };
};
