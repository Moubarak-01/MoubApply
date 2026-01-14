import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { User } from '../models/User.schema';
import { Job } from '../models/Job.schema';
import { Application, ApplicationStatus } from '../models/Application.schema';
import { generateEssay } from './aiMatcher';

export const autoApply = async (applicationId: string) => {
    console.log(`Starting auto-apply for application: ${applicationId}`);

    // 1. Fetch Data
    const application = await Application.findById(applicationId);
    if (!application) throw new Error('Application not found');

    const job = await Job.findById(application.jobId);
    const user = await User.findById(application.userId);

    if (!job || !user) throw new Error('Job or User not found');
    if (!job.applyLink) throw new Error('Job has no apply link');

    // 2. Launch Browser
    let browser;
    try {
        browser = await chromium.launch({
            headless: false,
            slowMo: 50,
            args: ['--start-maximized']
        });
        const context = await browser.newContext({ viewport: null });
        const page = await context.newPage();

        // 3. Update Status
        application.status = ApplicationStatus.PROCESSING;
        await application.save();

        console.log(`Navigating to: ${job.applyLink}`);
        await page.goto(job.applyLink, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // WAIT for potential redirects or iframes to settle
        await page.waitForTimeout(5000);

        // 4. SMART FILL STRATEGY (Supports Iframes & Fuzzy Labels)

        // Prepare User Data
        // Prepare User Data
        const firstName = user.name.split(' ')[0];
        const lastName = user.name.split(' ').slice(1).join(' ') || firstName;

        // Dynamic Personal Details (with safe fallbacks)
        const phone = user.personalDetails?.phone || '';
        const linkedin = user.personalDetails?.linkedin || '';
        const github = user.personalDetails?.github || '';

        const address = user.personalDetails?.address || "";
        const city = user.personalDetails?.city || "";
        const state = user.personalDetails?.state || "";
        const zip = user.personalDetails?.zip || "";

        const university = user.personalDetails?.university || "";
        const degree = user.personalDetails?.degree || "";
        const gpa = user.personalDetails?.gpa || "";


        // Mappings: [Regex, Value]
        const fieldMappings: [RegExp, string][] = [
            // Name
            [/First.*Name|Given.*Name|Forename/i, firstName],
            [/Last.*Name|Family.*Name|Surname/i, lastName],
            [/Full.*Name/i, user.name],

            // Contact
            [/Email/i, user.email],
            [/Phone|Mobile|Cell/i, phone],

            // Address (New)
            [/Address|Street/i, address],
            [/City|Town/i, city],
            [/State|Province|Region/i, state],
            [/Zip|Postal/i, zip],

            // Education (New)
            [/School|University|College|Institution/i, university],
            [/Degree|Major|Field of Study/i, degree],
            [/GPA/i, gpa],

            // URLs
            [/LinkedIn/i, linkedin],
            [/GitHub|Portfolio|Website/i, github],

            // Cover Letter
            [/Cover.*Letter|Message|Additional.*Info/i, application.coverLetter || ""],

            // Lever Specifics (often use 'name="org"' or similar, but label usually 'Current Company')
            [/Current.*Company|Employer/i, "Student / Freelance"],
            [/Work.*Authorization/i, "Yes, I am authorized"], // Heuristic
            [/Sponsorship/i, "No, I do not require sponsorship"] // Heuristic
        ];

        // Resume Path Logic
        let resumePath: string | null = null;
        if (application.tailoredPdfUrl) {
            resumePath = path.join(process.cwd(), application.tailoredPdfUrl.replace(/^\//, ''));
        } else if (user.resumes && user.resumes.length > 0) {
            resumePath = path.join(process.cwd(), user.resumes[0].path.replace(/^\//, ''));
        }

        // --- PLATFORM SPECIFIC LOGIC ---
        const url = job.applyLink.toLowerCase();

        // --- AI ESSAY GENERATION ---
        let whyUsEssay = user.essayAnswers?.whyExcited || "";
        if (user.preferences?.autoGenerateEssays) {
            console.log(`🤖 [AUTO_APPLY] User has autoGenerateEssays enabled. Generating essay...`);
            try {
                whyUsEssay = await generateEssay(job._id.toString(), user._id.toString());
            } catch (err: any) {
                console.warn(`⚠️ [AUTO_APPLY] Essay generation failed, using fallback: ${err.message}`);
            }
        }

        // MAPPINGS DEFINITION (Global Scope for this function)

        const extendedMappings: [RegExp, string][] = [
            [/Gender/i, user.demographics?.gender || ""],
            [/Race|Ethnicity/i, user.demographics?.race || ""],
            [/Veteran/i, user.demographics?.veteran || ""],
            [/Disability/i, user.demographics?.disability || ""],
            [/Work.*Authorization|Authorized/i, user.commonReplies?.workAuth || ""],
            [/Sponsorship/i, user.commonReplies?.sponsorship || ""],
            [/Relocate|Relocation/i, user.commonReplies?.relocation || ""],
            [/Former.*Employee|Previous.*Employment/i, user.commonReplies?.formerEmployee || ""],

            // Custom Answers
            [/Pronoun/i, user.customAnswers?.pronouns || ""],
            [/Country/i, "United States"],
            [/How.*hear/i, user.essayAnswers?.howDidYouHear || ""],
            [/Why.*excited|Why.*join/i, whyUsEssay],

            // Conflict / Legal Defaults (These can stay as "No" since they're legal disclaimers)
            [/Conflict.*Interest/i, user.customAnswers?.conflictOfInterest || "No"],
            [/Family.*Rel/i, user.customAnswers?.familyRel || "No"],
            [/Government.*Official/i, user.customAnswers?.govOfficial || "No"],
            [/LGBT/i, ""],
            [/Confidence.*Scale/i, ""]
        ];

        // Workday (Microsoft, MongoDB, Walmart)
        if (url.includes('myworkdayjobs')) {
            console.log('Detecting Workday ATS...');
            console.log('👉 ACTION: Please Log In / Create Account manually if prompted.');
            await page.waitForTimeout(10000); // Give user 10s initially to react
        }

        // Lever (Stripe, Netflix)
        // Lever usually has everything on one page, our generic scanner works well, 
        // but we add specific backup selectors just in case.


        // --- THE "FRAME LOOPER" ---
        // Look at the main page AND all iframes (CareerPuck/Greenhouse often use iframes)
        const frames = page.frames();
        console.log(`Found ${frames.length} frames. Scanning all for inputs...`);

        let formFilledInAnyFrame = false;

        for (const frame of frames) {
            try {
                // A. Upload Resume First (Often auto-fills other fields)
                if (resumePath && fs.existsSync(resumePath)) {
                    // Try exact file inputs
                    const fileInput = frame.locator('input[type="file"]');
                    if (await fileInput.count() > 0) {
                        console.log(`📄 Found file upload in frame: ${frame.url()}`);
                        await fileInput.first().setInputFiles(resumePath);
                        await page.waitForTimeout(2000); // Wait for parsing
                    } else {
                        // Try "Attach" buttons (Greenhouse style)
                        const attachButton = frame.getByText(/Attach.*Resume|Upload.*Resume/i);
                        if (await attachButton.count() > 0) {
                            await attachButton.first().setInputFiles(resumePath);
                        }
                    }
                }

                // B. Fill Text Fields
                for (const [regex, value] of fieldMappings) {
                    if (!value) continue;

                    // 1. Try By Label
                    const byLabel = frame.getByLabel(regex);
                    if (await byLabel.count() > 0) {
                        // check if visible
                        if (await byLabel.first().isVisible()) {
                            await byLabel.first().fill(value);
                            formFilledInAnyFrame = true;
                            continue; // Move to next field
                        }
                    }

                    // 2. Try By Placeholder
                    const byPlaceholder = frame.getByPlaceholder(regex);
                    if (await byPlaceholder.count() > 0) {
                        if (await byPlaceholder.first().isVisible()) {
                            await byPlaceholder.first().fill(value);
                            formFilledInAnyFrame = true;
                            continue;
                        }
                    }
                }

                // C. Handle Dropdowns / Selects (Fuzzy Logic)
                const fuzzySelect = async (frame: any, labelRegex: RegExp, idealValue: string) => {
                    if (!idealValue) return;
                    try {
                        const select = frame.getByLabel(labelRegex).first();
                        if (await select.count() > 0 && await select.isVisible()) {
                            const options = await select.locator('option').allInnerTexts();
                            const params = idealValue.toLowerCase();
                            const bestMatch = options.find((opt: string) =>
                                opt.toLowerCase().includes(params) || params.includes(opt.toLowerCase())
                            );
                            if (bestMatch) {
                                await select.selectOption({ label: bestMatch });
                                formFilledInAnyFrame = true;
                                console.log(`🎯 Fuzzy Match: "${bestMatch}" for "${idealValue}"`);
                            } else {
                                await select.selectOption({ value: idealValue }).catch(() => { });
                            }
                        }
                    } catch (e) { }
                };



                for (const [regex, value] of extendedMappings) {
                    await fuzzySelect(frame, regex, value);
                }

                // D. Legacy Fallback (Commented out old exact match logic)
                /*
                const eeoMappings: [RegExp, string][] = [
                    [/Gender/i, user.demographics?.gender || "Male"],
                    [/Race|Ethnicity/i, user.demographics?.race || "Black"],
                    [/Veteran/i, user.demographics?.veteran || "not a protected veteran"],
                    [/Disability/i, user.demographics?.disability || "No"]
                ];
                
                for (const [regex, value] of eeoMappings) {
                    // Find select by label
                    const select = frame.getByLabel(regex);
                    if (await select.count() > 0 && await select.first().isVisible()) {
                        try {
                            // Try to select matches (e.g. "Male" selects "Male" or "I am Male")
                            await select.first().selectOption({ label: value });
                            formFilledInAnyFrame = true;
                        } catch (e) {
                            // Fallback: try substring matching for the option
                            // This is tricky in Playwright without evaluating, skipping for safety
                            // But often direct 'label' works if exact.
                        }
                    }
                }
                */
            } catch (err) {
                // Ignore frame cross-origin errors etc.
            }
        }

        if (formFilledInAnyFrame) {
            console.log('✅ Form fields detected and filled!');
        } else {
            console.warn('⚠️ Could not confidently match fields. They might be non-standard.');
        }

        // D. Handle TextAreas (Essays)
        for (const frame of frames) {
            for (const [regex, value] of extendedMappings) {
                try {
                    const area = frame.getByLabel(regex);
                    if (await area.count() > 0 && await area.first().isVisible()) {
                        await area.first().fill(value);
                        console.log(`📝 Filled TextArea: ${regex}`);
                    }
                } catch (e) { }
            }
        }

        // 5. Success / Pause
        console.log('✅ Pausing for 5 MINUTES for manual review/submission...');
        console.log('👉 Please check the browser window and click Submit if everything looks good.');
        await page.waitForTimeout(300000); // 5 minutes (user request)

        // Update Status
        application.status = ApplicationStatus.APPLIED;
        application.appliedAt = new Date();
        await application.save();

        // 6. Cleanup (SKIPPED per user request)

    } catch (error) {
        console.error('Auto-Apply Failed:', error);
        application.status = ApplicationStatus.ACTION_NEEDED;
        await application.save();
    } finally {
        if (browser) await browser.close();
    }
};
