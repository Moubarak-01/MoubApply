import axios from 'axios';
import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';
import { enrichJobWithAI } from './aiMatcher';

// Renamed from COMPANY_TOKENS to reflect these are specific boards we scrape
const GREENHOUSE_BOARDS = [
  'figma', 'stripe', 'airbnb', 'pinterest',
  'coinbase', 'mongodb', 'datadog', 'robinhood', 'lyft'
];

// Renamed from ROLE_KEYWORDS to reflect their purpose as filters for the raw board data
const TECH_FILTERS = [
  'Software', 'Engineer', 'Developer', 'AI', 'Artificial Intelligence',
  'Machine Learning', 'Data Science', 'Backend'
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches jobs from Adzuna API.
 */
const fetchAdzunaJobs = async (query: string) => {
  try {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) {
      console.warn("⚠️ Adzuna credentials missing in .env");
      return [];
    }

    console.log(`🌍 [Adzuna] Searching for: "${query}"...`);
    // 'content-type' is not needed in params for GET.
    const response = await axios.get(`https://api.adzuna.com/v1/api/jobs/us/search/1`, {
      params: {
        app_id: appId,
        app_key: appKey,
        results_per_page: 20,
        what: query,
        where: 'remote'
      },
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data.results || [];
  } catch (error: any) {
    console.error(`❌ Adzuna API Error:`, error.message);
    return [];
  }
};

/**
 * Fetches jobs from JSearch RapidAPI.
 */
const fetchJSearchJobs = async (query: string, page: number = 1) => {
  try {
    const options = {
      method: 'GET',
      url: 'https://jsearch.p.rapidapi.com/job-search',
      params: {
        query: query,
        page: page.toString(),
        num_pages: '1'
      },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY || '',
        'x-rapidapi-host': process.env.RAPIDAPI_HOST || 'jsearch.p.rapidapi.com'
      }
    };

    const response = await axios.request(options);
    return response.data.data || [];
  } catch (error: any) {
    console.error(`❌ JSearch API Error:`, error.message);
    return [];
  }
};

/**
 * Ingests jobs from specific Greenhouse boards (High-tier tech).
 */
const ingestGreenhouseJobs = async (matchingUser: any, query?: string) => {
  let count = 0;
  for (const token of GREENHOUSE_BOARDS) {
    try {
      console.log(`🏢 [Greenhouse] Processing: ${token.toUpperCase()}...`);
      const response = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
      const ghJobs = response.data.jobs || [];

      let boardNewCount = 0;

      for (const ghJob of ghJobs) {
        const title = ghJob.title;
        const lowerTitle = title.toLowerCase();

        // Smart Filtering
        const isInternship = lowerTitle.includes('intern') || lowerTitle.includes('internship');
        const matchesTech = TECH_FILTERS.some(k => lowerTitle.includes(k.toLowerCase()));

        // If a specific query is provided, prioritize it, otherwise use default filter
        const queryMatch = query ? lowerTitle.includes(query.toLowerCase()) : (isInternship && matchesTech);

        if (!queryMatch) continue;

        // Deduplication
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
            tags: [ghJob.location?.name || 'Global', 'Internship', 'Greenhouse'],
            gradYearReq: 2026,
            aiSummary: { whyYouWillLoveIt: '', theCatch: '', topSkills: [] },
          });

          await newJob.save();
          count++;
          boardNewCount++;

        } catch (err: any) {
          if (err.code !== 11000) console.error(`❌ Failed to save GH job ${title}:`, err.message);
        }
      }
      console.log(`   ✅ [${token.toUpperCase()}] Found ${ghJobs.length} raw jobs. Saved ${boardNewCount} relevant new jobs.`);

    } catch (error: any) {
      console.error(`❌ Failed to process GH board ${token}:`, error.message);
    }
  }
  return count;
};

/**
 * Main Ingestion Function
 */
export const ingestJobs = async (userId?: string, query?: string) => {
  console.log("🔍 Starting Universal Job Ingestion...");

  // 1. Resolve User
  let matchingUser = null;
  if (userId) {
    matchingUser = await User.findById(userId);
  }
  if (!matchingUser) {
    matchingUser = await User.findOne({ masterResumeText: { $exists: true, $ne: "" } });
  }

  let totalNewJobs = 0;

  // 2. Run Greenhouse Ingestion
  // passing query here allows filtering the specific boards too
  totalNewJobs += await ingestGreenhouseJobs(matchingUser, query);

  // 3. Run JSearch Ingestion
  try {
    const searchQuery = query || "Software Engineer Intern";
    console.log(`🌍 [JSearch] Searching for: "${searchQuery}"...`);
    const jSearchResults = await fetchJSearchJobs(searchQuery, 1);

    console.log(`🌍 [JSearch] Found ${jSearchResults.length} results.`);

    for (const jJob of jSearchResults) {
      // Deduplication
      const externalId = jJob.job_id;
      const existingJob = await Job.findOne({ externalId });
      if (existingJob) continue;

      try {
        const newJob = new Job({
          title: jJob.job_title,
          company: jJob.employer_name,
          rawDescription: jJob.job_description || 'No description',
          applyLink: jJob.job_apply_link,
          externalId: externalId,
          matchScore: 0,
          tags: [jJob.job_city || 'Remote', jJob.job_country || 'Global', 'JSearch'],
          gradYearReq: 2026, // Default assumption, or extract from description if possible
          aiSummary: { whyYouWillLoveIt: '', theCatch: '', topSkills: [] },
        });

        await newJob.save();
        totalNewJobs++;

        // if (matchingUser && matchingUser.masterResumeText) {
        //   console.log(`🤖 Auto-matching (JSearch): ${newJob.title}`);
        //   await sleep(3000);
        //   await enrichJobWithAI(newJob._id.toString(), matchingUser._id.toString()).catch(e => console.error(`❌ AI match failed:`, e.message));
        // }

      } catch (err: any) {
        if (err.code !== 11000) console.error(`❌ Failed to save JSearch job:`, err.message);
      }
    }

  } catch (error: any) {
    console.error("❌ JSearch Ingestion Failed:", error.message);
  }

  // 4. Run Adzuna Ingestion
  try {
    const searchQuery = query || "Software Engineer Intern";
    const adzunaResults = await fetchAdzunaJobs(searchQuery);
    console.log(`🌍 [Adzuna] Found ${adzunaResults.length} results.`);

    for (const aJob of adzunaResults) {
      const externalId = `adzuna-${aJob.id}`;
      const existingJob = await Job.findOne({ externalId });
      if (existingJob) continue;

      try {
        const newJob = new Job({
          title: aJob.title,
          company: aJob.company?.display_name || 'Unknown',
          rawDescription: aJob.description || 'No description',
          applyLink: aJob.redirect_url,
          externalId: externalId,
          matchScore: 0,
          tags: [aJob.location?.display_name || 'Remote', 'Adzuna'],
          gradYearReq: 2026,
          aiSummary: { whyYouWillLoveIt: '', theCatch: '', topSkills: [] },
        });
        await newJob.save();
        totalNewJobs++;
      } catch (err: any) {
        // ignore dups
      }
    }

  } catch (error: any) {
    console.error("❌ Adzuna Ingestion Failed:", error.message);
  }

  return {
    message: `Ingestion complete. Found ${totalNewJobs} new jobs.`,
    newJobs: totalNewJobs
  };
};