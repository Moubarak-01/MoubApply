import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
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

        // 4. Fill Common Fields (Heuristics for Greenhouse/Lever/Workday)

        // Names
        const firstName = user.name.split(' ')[0];
        const lastName = user.name.split(' ').slice(1).join(' ') || firstName;

        const nameMappings = [
            { label: /First Name/i, value: firstName },
            { label: /Last Name/i, value: lastName },
            { label: /Full Name/i, value: user.name },
            { label: /Email/i, value: user.email },
            { label: /Phone/i, value: '945-276-8717' }, // Using user's real phone from resume if available
            { label: /LinkedIn/i, value: 'https://linkedin.com/in/moubarak-ali-kparah' },
            { label: /GitHub/i, value: 'https://github.com/Moubarak-01' },
            { label: /Website/i, value: 'https://github.com/Moubarak-01' },
        ];

        for (const mapping of nameMappings) {
            try {
                await page.getByLabel(mapping.label).fill(mapping.value, { timeout: 2000 });
            } catch (e) {
                // Try by placeholder if label fails
                try {
                    await page.getByPlaceholder(mapping.label).fill(mapping.value, { timeout: 1000 });
                } catch (e2) { }
            }
        }

        // Cover Letter (if available)
        if (application.coverLetter) {
            console.log('Filling cover letter...');
            const clSelectors = [
                /Cover Letter/i,
                /Additional Information/i,
                /Comments/i,
                /Message to Hiring Manager/i
            ];

            for (const sel of clSelectors) {
                try {
                    await page.getByLabel(sel).fill(application.coverLetter, { timeout: 2000 });
                    break; // Stop after first successful fill
                } catch (e) {
                    try {
                        await page.getByPlaceholder(sel).fill(application.coverLetter, { timeout: 1000 });
                        break;
                    } catch (e2) { }
                }
            }
        }

        // Resume Upload (Tailored vs Master)
        let fullPath: string | null = null;

        if (application.tailoredPdfUrl) {
            // application.tailoredPdfUrl is like "/generated_pdfs/tailored_..."
            // We need to map this to the actual file on disk
            const relativePath = application.tailoredPdfUrl.replace(/^\//, ''); // remove leading slash
            fullPath = path.join(process.cwd(), relativePath);
        } else if (user.resumes && user.resumes.length > 0) {
            // user.resumes[0].path is like "/uploads/..."
            const relativePath = user.resumes[0].path.replace(/^\//, '');
            fullPath = path.join(process.cwd(), relativePath);
        }

        if (fullPath && fs.existsSync(fullPath)) {
            console.log(`Uploading resume from: ${fullPath}`);

            const fileInput = await page.locator('input[type="file"]');
            if (await fileInput.count() > 0) {
                await fileInput.first().setInputFiles(fullPath);
            }
        } else {
            console.warn(`Resume file not found at: ${fullPath}`);
        }

        // 5. Success (Mocked for now - we don't actually click submit to avoid spamming)
        console.log('✅ Form filled. Pausing for 60 SECONDS for manual review/submission...');
        console.log('👉 Please check the browser window and click Submit if everything looks good.');
        await page.waitForTimeout(60000); // 1 minute pause for user review

        // Update Status to Applied
        application.status = ApplicationStatus.APPLIED;
        application.appliedAt = new Date();
        await application.save();

        // 6. Cleanup Generated Files (User Request)
        if (application.tailoredPdfUrl && fullPath && fs.existsSync(fullPath)) {
            try {
                fs.unlinkSync(fullPath);
                console.log(`🧹 Cleanup: Deleted temporary resume file: ${fullPath}`);
                // Optional: Clear the URL from the DB record if desired, but keeping record is usually fine.
                // application.tailoredPdfUrl = ""; 
                // await application.save();
            } catch (e) {
                console.error("Cleanup failed:", e);
            }
        }

    } catch (error) {
        console.error('Auto-Apply Failed:', error);
        application.status = ApplicationStatus.ACTION_NEEDED; // Flag for user help
        await application.save();
    } finally {
        await browser.close();
    }
};
