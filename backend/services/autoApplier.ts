import { chromium } from 'playwright';
import { User } from '../models/User.schema';
import { Job } from '../models/Job.schema';
import { Application, ApplicationStatus } from '../models/Application.schema';

export const autoApply = async (applicationId: string) => {
  console.log(`Starting auto-apply for application: ${applicationId}`);

  // 1. Fetch Data
  const application = await Application.findById(applicationId);
  if (!application) throw new Error('Application not found');

  const job = await Job.findById(application.jobId);
  const user = await User.findById(application.userId);

  if (!job || !user) throw new Error('Job or User not found');
  if (!job.applyLink) throw new Error('Job has no apply link');

  // 2. Launch Browser (Headless: false for demo visibility)
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 3. Update Status to Processing
    application.status = ApplicationStatus.PROCESSING;
    await application.save();

    console.log(`Navigating to: ${job.applyLink}`);
    await page.goto(job.applyLink, { waitUntil: 'networkidle' });

    // 4. Fill Common Fields (Heuristics for Greenhouse/Lever)
    // First Name
    await page.getByLabel(/First Name/i).fill(user.name.split(' ')[0]).catch(() => {});
    await page.getByLabel(/Last Name/i).fill(user.name.split(' ').slice(1).join(' ')).catch(() => {});
    
    // Email
    await page.getByLabel(/Email/i).fill(user.email).catch(() => {});
    
    // Phone (Hardcoded for now, add to User schema later)
    await page.getByLabel(/Phone/i).fill('555-0123').catch(() => {});

    // LinkedIn (Heuristic)
    await page.getByLabel(/LinkedIn/i).fill('linkedin.com/in/demo-user').catch(() => {});

    // Resume Upload (Find file input)
    // We pick the first resume from the user's profile if available
    if (user.resumes && user.resumes.length > 0) {
        const resumePath = user.resumes[0].path; // e.g. /uploads/filename
        const fullPath = process.cwd() + resumePath; 
        console.log(`Uploading resume from: ${fullPath}`);
        
        const fileInput = await page.locator('input[type="file"]');
        if (await fileInput.count() > 0) {
             await fileInput.first().setInputFiles(fullPath);
        }
    }

    // 5. Success (Mocked for now - we don't actually click submit to avoid spamming)
    console.log('Form filled. Waiting 5 seconds before closing...');
    await page.waitForTimeout(5000);

    // Update Status to Applied (or Action Needed if we want user review)
    // For now, let's say "Action Needed" so user can review and click submit
    application.status = ApplicationStatus.ACTION_NEEDED;
    await application.save();

  } catch (error) {
    console.error('Auto-Apply Failed:', error);
    application.status = ApplicationStatus.ACTION_NEEDED; // Flag for user help
    await application.save();
  } finally {
    await browser.close();
  }
};
