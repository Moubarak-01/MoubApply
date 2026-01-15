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

// Simplify GitHub Job Sources (Community-Curated, High Quality)
// Auto-updates URLs based on current year and month
const getCurrentYear = () => new Date().getFullYear();
const getCurrentMonth = () => new Date().getMonth(); // 0 = Jan, 7 = Aug, 8 = Sep, 11 = Dec
const getInternshipYear = () => {
  // Jan-Aug: Search for THIS summer's internships
  // Sep-Dec: Search for NEXT summer's internships
  return getCurrentMonth() <= 7 ? getCurrentYear() : getCurrentYear() + 1;
};
const getNewGradYear = () => getCurrentYear(); // New grad positions are always for current year

const SIMPLIFY_SOURCES = [
  {
    name: `Summer ${getInternshipYear()} Internships`,
    url: `https://raw.githubusercontent.com/SimplifyJobs/Summer${getInternshipYear()}-Internships/dev/.github/listings.json`,
    type: 'Internship',
    priority: 1, // Higher priority = shows first
    gradYear: getInternshipYear() - 2 // Summer 2026 internships need 2024 grads (you're class of 2028, so this won't match, but that's okay)
  },
  {
    name: `New Grad ${getNewGradYear()} Positions`,
    url: `https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/listings.json`,
    type: 'New Grad',
    priority: 2,
    gradYear: getNewGradYear() // 2026 grads for 2026 new grad positions
  }
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: Detects seniority level from job title
 * Returns: { level: string, isInternship: boolean, isSenior: boolean }
 */
const detectSeniority = (title: string, sourceType?: string) => {
  const lowerTitle = title.toLowerCase();
  let seniorityLevel = 'Entry Level';
  let isInternship = false;
  let isSenior = false;

  if (lowerTitle.includes('intern') || sourceType === 'Internship') {
    seniorityLevel = 'Internship';
    isInternship = true;
  } else if (lowerTitle.includes('senior') || lowerTitle.includes('staff') || lowerTitle.includes('principal') || lowerTitle.includes('lead')) {
    seniorityLevel = 'Senior';
    isSenior = true;
  } else if (lowerTitle.includes('new grad') || lowerTitle.includes('entry') || sourceType === 'New Grad') {
    seniorityLevel = 'New Grad / Entry Level';
  } else if (lowerTitle.includes('mid') || lowerTitle.includes('ii') || lowerTitle.includes(' 2') || lowerTitle.includes('associate')) {
    seniorityLevel = 'Mid-Level';
  }

  return { seniorityLevel, isInternship, isSenior };
};

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

        // SENIORITY DETECTION
        const { seniorityLevel, isInternship, isSenior } = detectSeniority(title);
        const matchesTech = TECH_FILTERS.some(k => lowerTitle.includes(k.toLowerCase()));

        // CRITICAL: Skip senior roles unless explicitly queried
        if (isSenior && !query) continue;

        // If a specific query is provided, accept it; otherwise ONLY internships
        const queryMatch = query ? lowerTitle.includes(query.toLowerCase()) : (isInternship && matchesTech);

        if (!queryMatch) continue;

        // Deduplication
        const existingJob = await Job.findOne({ externalId: ghJob.id.toString() });
        if (existingJob) continue;

        // Build enhanced description with seniority label
        const rawDescription = `
🎯 SENIORITY LEVEL: ${seniorityLevel}

${ghJob.content || 'No description provided.'}
        `.trim();

        try {
          const newJob = new Job({
            title: title,
            company: token.charAt(0).toUpperCase() + token.slice(1),
            rawDescription: rawDescription,
            applyLink: ghJob.absolute_url,
            externalId: ghJob.id.toString(),
            matchScore: 0,
            tags: [ghJob.location?.name || 'Global', seniorityLevel, 'Greenhouse'],
            gradYearReq: isInternship ? 2026 : (seniorityLevel === 'New Grad / Entry Level' ? 2026 : 2025),
            aiSummary: { whyYouWillLoveIt: '', theCatch: '', topSkills: [] },
          });

          await newJob.save();
          count++;
          boardNewCount++;

          // AI Auto-Match: ONLY for USA-based Internships (user preference)
          const locationName = ghJob.location?.name || '';
          const isUSAJob = /USA|United States|Remote|US$/i.test(locationName);

          if (matchingUser && matchingUser.masterResumeText && isUSAJob && isInternship) {
            console.log(`🤖 Auto-matching (USA Internship): ${newJob.title}`);
            await sleep(3000); // Rate limit protection
            await enrichJobWithAI(newJob._id.toString(), matchingUser._id.toString()).catch(e => console.error(`❌ AI match failed:`, e.message));
          } else if (matchingUser && matchingUser.masterResumeText && (!isUSAJob || !isInternship)) {
            console.log(`⏸️ Skipping auto-match (not USA internship): ${newJob.title}`);
          }

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
 * Ingests jobs from Simplify GitHub sources (Community-curated, high quality)
 * Includes advanced seniority detection and clear labeling
 */
const ingestSimplifyJobs = async (matchingUser: any, query?: string) => {
  let count = 0;

  for (const source of SIMPLIFY_SOURCES) {
    try {
      console.log(`📊 [Simplify] Processing: ${source.name}...`);
      const response = await axios.get(source.url, { timeout: 15000 });
      const items = response.data || [];

      let sourceNewCount = 0;

      for (const item of items) {
        const title = item.title || '';
        const company = item.company_name || 'Unknown Company';
        const locations = item.locations || [];
        const lowerTitle = title.toLowerCase();

        // 1. SENIORITY DETECTION (Critical for User)
        const { seniorityLevel, isInternship, isSenior } = detectSeniority(title, source.type);

        // 2. Filter for Tech Roles
        const matchesTech = TECH_FILTERS.some(k => lowerTitle.includes(k.toLowerCase()));
        if (!matchesTech) continue;

        // 3. STRICT US FILTERING
        const isUS = locations.some((l: string) => {
          const loc = l.toLowerCase();
          return (
            loc.includes('united states') ||
            loc.includes(', us') ||
            loc.includes('remote') ||
            // Major tech hubs
            ['nyc', 'new york', 'sf', 'san francisco', 'austin', 'seattle',
              'boston', 'chicago', 'atlanta', 'los angeles', 'denver', 'portland'].some(city => loc.includes(city))
          );
        });
        if (!isUS) continue;

        // 4. Deduplication (Using Simplify's internal ID)
        const externalId = `simplify-${item.id || (company + title).replace(/\s+/g, '')}`;
        const existingJob = await Job.findOne({ externalId });
        if (existingJob) continue;

        // 5. Build Enhanced Description with Clear Seniority
        const locationStr = locations.join(', ');
        const rawDescription = `
🎯 SENIORITY LEVEL: ${seniorityLevel}

📍 LOCATIONS: ${locationStr}

📌 SOURCE: This ${seniorityLevel} role was added via the community-curated SimplifyJobs repository on GitHub. It is among the freshest postings from top tech companies.

${item.description || 'No detailed description available. Visit the application link for full details.'}
        `.trim();

        try {
          const newJob = new Job({
            title: title,
            company: company,
            rawDescription: rawDescription,
            applyLink: item.url,
            externalId: externalId,
            matchScore: 0,
            tags: [...locations, source.type, 'Simplify', seniorityLevel],
            gradYearReq: source.gradYear, // Dynamic based on internship/new grad year
            aiSummary: { whyYouWillLoveIt: '', theCatch: '', topSkills: [] },
          });

          await newJob.save();
          count++;
          sourceNewCount++;

          // AI Auto-Match: ONLY for USA-based Internships (user preference)
          const isUSAJob = locations.some((loc: string) => /USA|United States|Remote|US$/i.test(loc));
          const isInternship = seniorityLevel === 'Internship';

          if (matchingUser && matchingUser.masterResumeText && isUSAJob && isInternship) {
            console.log(`🤖 Auto-matching (USA Internship): ${newJob.title}`);
            await sleep(3000); // Rate limit protection
            await enrichJobWithAI(newJob._id.toString(), matchingUser._id.toString()).catch(e => console.error(`❌ AI match failed:`, e.message));
          } else if (matchingUser && matchingUser.masterResumeText && (!isUSAJob || !isInternship)) {
            console.log(`⏸️ Skipping auto-match (not USA internship): ${newJob.title} - Match manually later`);
          }
        } catch (err: any) {
          if (err.code !== 11000) console.error(`❌ Failed to save Simplify job ${title}:`, err.message);
        }
      }

      console.log(`   ✅ [SIMPLIFY] ${source.name}: Processed ${items.length} raw jobs. Saved ${sourceNewCount} relevant US tech roles.`);

      // Log auto-matching status
      if (matchingUser && matchingUser.masterResumeText) {
        console.log(`   🤖 Auto-matching enabled for ${sourceNewCount} new jobs (User has resume uploaded)`);
      } else {
        console.log(`   ⚠️ Auto-matching SKIPPED - User needs to upload resume first`);
      }
    } catch (error: any) {
      console.error(`❌ Failed to process Simplify source ${source.name}:`, error.message);
    }
  }

  return count;
};

/**
 * Main Ingestion Function
 */
export const ingestJobs = async (userId?: string, query?: string) => {
  console.log("🔍 Starting Universal Job Ingestion...");

  // 1. Resolve User - CRITICAL FOR AUTO-MATCHING
  let matchingUser = null;
  if (userId) {
    matchingUser = await User.findById(userId);
    console.log(`✅ User resolved by ID: ${matchingUser?.name || 'Unknown'} (Resume uploaded: ${!!matchingUser?.masterResumeText})`);
  }

  if (!matchingUser) {
    matchingUser = await User.findOne({ masterResumeText: { $exists: true, $ne: "" } });
    if (matchingUser) {
      console.log(`✅ Fallback user found: ${matchingUser.name} (Resume uploaded: ${!!matchingUser.masterResumeText})`);
    } else {
      console.warn(`⚠️ NO USER WITH RESUME FOUND - Auto-matching will be SKIPPED!`);
    }
  }

  let totalNewJobs = 0;

  // 2. Run Simplify Ingestion FIRST (Highest Quality + Internships Priority)
  console.log('🚀 [PRIORITY] Starting with Simplify sources (Internships first)...');
  totalNewJobs += await ingestSimplifyJobs(matchingUser, query);

  // 3. Run Greenhouse Ingestion
  // passing query here allows filtering the specific boards too
  totalNewJobs += await ingestGreenhouseJobs(matchingUser, query);

  // 3. Run JSearch Ingestion
  try {
    const searchQuery = query || "Software Engineer Intern";
    console.log(`🌍 [JSearch] Searching for: "${searchQuery}"...`);
    const jSearchResults = await fetchJSearchJobs(searchQuery, 1);

    console.log(`🌍 [JSearch] Found ${jSearchResults.length} results.`);

    for (const jJob of jSearchResults) {
      const title = jJob.job_title;
      const description = jJob.job_description || '';

      // SENIORITY DETECTION
      const { seniorityLevel, isInternship, isSenior } = detectSeniority(title);

      // CRITICAL: When no custom query, ONLY show internships
      if (!query && !isInternship) continue;

      // Skip senior roles unless explicitly queried
      if (isSenior && !query) continue;

      // Deduplication
      const externalId = jJob.job_id;
      const existingJob = await Job.findOne({ externalId });
      if (existingJob) continue;

      // Enhanced description
      const rawDescription = `
🎯 SENIORITY LEVEL: ${seniorityLevel}

${description}
      `.trim();

      try {
        const newJob = new Job({
          title: title,
          company: jJob.employer_name,
          rawDescription: rawDescription,
          applyLink: jJob.job_apply_link,
          externalId: externalId,
          matchScore: 0,
          tags: [jJob.job_city || 'Remote', jJob.job_country || 'Global', seniorityLevel, 'JSearch'],
          gradYearReq: isInternship ? 2026 : (seniorityLevel === 'New Grad / Entry Level' ? 2026 : 2025),
          aiSummary: { whyYouWillLoveIt: '', theCatch: '', topSkills: [] },
        });

        await newJob.save();
        totalNewJobs++;

        // AI Auto-Match: ONLY for USA-based Internships (user preference)
        const jobCountry = jJob.job_country || '';
        const isUSAJob = /USA|United States|US$/i.test(jobCountry) || jJob.job_city === 'Remote';

        if (matchingUser && matchingUser.masterResumeText && isUSAJob && isInternship) {
          console.log(`🤖 Auto-matching (USA Internship): ${newJob.title}`);
          await sleep(3000); // Rate limit protection
          await enrichJobWithAI(newJob._id.toString(), matchingUser._id.toString()).catch(e => console.error(`❌ AI match failed:`, e.message));
        } else if (matchingUser && matchingUser.masterResumeText && (!isUSAJob || !isInternship)) {
          console.log(`⏸️ Skipping auto-match (not USA internship): ${newJob.title}`);
        }

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
      const title = aJob.title;
      const description = aJob.description || '';

      // SENIORITY DETECTION
      const { seniorityLevel, isInternship, isSenior } = detectSeniority(title);

      // CRITICAL: When no custom query, ONLY show internships
      if (!query && !isInternship) continue;

      // Skip senior roles unless explicitly queried
      if (isSenior && !query) continue;

      const externalId = `adzuna-${aJob.id}`;
      const existingJob = await Job.findOne({ externalId });
      if (existingJob) continue;

      // Enhanced description
      const rawDescription = `
🎯 SENIORITY LEVEL: ${seniorityLevel}

${description}
      `.trim();

      try {
        const newJob = new Job({
          title: title,
          company: aJob.company?.display_name || 'Unknown',
          rawDescription: rawDescription,
          applyLink: aJob.redirect_url,
          externalId: externalId,
          matchScore: 0,
          tags: [aJob.location?.display_name || 'Remote', seniorityLevel, 'Adzuna'],
          gradYearReq: isInternship ? 2026 : (seniorityLevel === 'New Grad / Entry Level' ? 2026 : 2025),
          aiSummary: { whyYouWillLoveIt: '', theCatch: '', topSkills: [] },
        });
        await newJob.save();
        totalNewJobs++;

        // AI Auto-Match: ONLY for USA-based Internships (user preference)
        const locationDisplay = aJob.location?.display_name || '';
        const isUSAJob = /USA|United States|US$/i.test(locationDisplay) || locationDisplay.toLowerCase() === 'remote';

        if (matchingUser && matchingUser.masterResumeText && isUSAJob && isInternship) {
          console.log(`🤖 Auto-matching (USA Internship): ${newJob.title}`);
          await sleep(3000); // Rate limit protection
          await enrichJobWithAI(newJob._id.toString(), matchingUser._id.toString()).catch(e => console.error(`❌ AI match failed:`, e.message));
        } else if (matchingUser && matchingUser.masterResumeText && (!isUSAJob || !isInternship)) {
          console.log(`⏸️ Skipping auto-match (not USA internship): ${newJob.title}`);
        }
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
