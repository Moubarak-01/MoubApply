import { chromium, Frame, Page, Locator } from 'playwright';
import path from 'path';
import fs from 'fs';
import { User, IUser } from '../models/User.schema';
import { Job } from '../models/Job.schema';
import { Application, ApplicationStatus } from '../models/Application.schema';
import { generateEssay } from './aiMatcher';
import { matchFieldValue, getEmploymentEntry, getEducationEntry, FormField, findBestOption } from './aiFieldMatcher';

/**
 * Handle custom dropdowns (divs/buttons that act like selects)
 * Strategy: Click trigger -> Wait for list -> Click option
 */
async function handleCustomSelect(frame: Frame, labelRegex: RegExp, targetValue: string): Promise<boolean> {
    if (!targetValue) return false;

    try {
        // 1. Find the Trigger Element
        const trigger = frame.getByLabel(labelRegex).first();

        if (await trigger.count() === 0 || !(await trigger.isVisible())) {
            return false;
        }

        // Avoid inputs/selects
        const tagName = await trigger.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return false;

        console.log(`🖱️ [CUSTOM_SELECT] Clicking trigger for /${labelRegex.source}/`);
        await trigger.click();
        await frame.page().waitForTimeout(800); // Wait for animation

        // 2. Find the Option (Exact or Partial)
        // We look for ANY text matching our target value that is visible
        let option = frame.locator(`text="${targetValue}"`).first();
        if (await option.count() === 0 || !(await option.isVisible())) {
            option = frame.getByText(targetValue, { exact: false }).first();
        }

        if (await option.count() > 0 && await option.isVisible()) {
            await option.click();
            console.log(`🎯 [CUSTOM_SELECT] Clicked "${targetValue}"`);
            return true;
        }

        // 3. Smart Fallback for Binary Options (Yes/No)
        if (targetValue.toLowerCase() === 'yes' || targetValue.toLowerCase() === 'no') {
            const partial = frame.locator('[role="option"], li, div').filter({ hasText: targetValue }).first();
            if (await partial.count() > 0 && await partial.isVisible()) {
                await partial.click();
                console.log(`🎯 [CUSTOM_SELECT] Clicked partial binary match for "${targetValue}"`);
                return true;
            }
        }

        // Close dropdown if we failed (click body)
        await frame.locator('body').click({ position: { x: 0, y: 0 } }).catch(() => { });
        return false;

    } catch (e) {
        return false;
    }
}

/**
 * Handle typeahead/autocomplete fields
 */
async function handleTypeahead(frame: Frame, labelRegex: RegExp, value: string): Promise<boolean> {
    if (!value) return false;

    try {
        const container = frame.getByLabel(labelRegex).first();
        if (await container.count() === 0 || !(await container.isVisible())) return false;

        const tagName = await container.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
        if (tagName === 'select') return false;

        await container.click();
        await frame.page().waitForTimeout(300);
        await container.fill(value);
        await frame.page().waitForTimeout(500);

        const suggestions = frame.locator('[role="option"], [role="listbox"] > *, .suggestion, .autocomplete-item').filter({ hasText: new RegExp(value.split(' ')[0], 'i') });

        if (await suggestions.count() > 0) {
            await suggestions.first().click();
            console.log(`🔍 [TYPEAHEAD] Selected "${value}" from suggestions`);
            return true;
        }

        await container.press('Enter');
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Scrape all visible form fields
 */
async function scrapeFormFields(frame: Frame): Promise<FormField[]> {
    const fields: FormField[] = [];
    try {
        const inputs = await frame.locator('input:visible').all();
        for (const input of inputs) {
            const type = await input.getAttribute('type') || 'text';
            if (['hidden', 'submit', 'button', 'file'].includes(type)) continue;
            const label = await getFieldLabel(frame, input);
            fields.push({
                type: type === 'checkbox' ? 'checkbox' : 'input',
                label,
                placeholder: await input.getAttribute('placeholder') || '',
                name: await input.getAttribute('name') || '',
                id: await input.getAttribute('id') || '',
                isRequired: await input.getAttribute('required') !== null
            });
        }
        // ... (simplified select/textarea scraping similar to before, omitting for brevity of rewrite but critical for logic)
        // Adding Selects
        const selects = await frame.locator('select:visible').all();
        for (const select of selects) {
            const label = await getFieldLabel(frame, select);
            const options = await select.locator('option').allInnerTexts();
            fields.push({ type: 'select', label, options: options.filter(o => o.trim() !== ''), name: await select.getAttribute('name') || '', id: await select.getAttribute('id') || '', isRequired: await select.getAttribute('required') !== null });
        }
        // Adding Textareas
        const textareas = await frame.locator('textarea:visible').all();
        for (const textarea of textareas) {
            const label = await getFieldLabel(frame, textarea);
            fields.push({ type: 'textarea', label, placeholder: await textarea.getAttribute('placeholder') || '', name: await textarea.getAttribute('name') || '', id: await textarea.getAttribute('id') || '', isRequired: await textarea.getAttribute('required') !== null });
        }
    } catch (e) { }
    return fields;
}

/**
 * Get Label Helper
 */
async function getFieldLabel(frame: Frame, element: any): Promise<string> {
    try {
        const ariaLabel = await element.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;
        const id = await element.getAttribute('id');
        if (id) {
            const label = await frame.locator(`label[for="${id}"]`).first();
            if (await label.count() > 0) return await label.innerText();
        }
        const parentLabel = await element.locator('xpath=ancestor::label').first();
        if (await parentLabel.count() > 0) return await parentLabel.innerText();
        return await element.getAttribute('placeholder') || 'Unknown';
    } catch (e) { return 'Unknown'; }
}


// ==========================================
// MAIN AUTO APPLY FUNCTION
// ==========================================
export const autoApply = async (applicationId: string) => {
    console.log(`Starting auto-apply for application: ${applicationId}`);

    const application = await Application.findById(applicationId);
    if (!application) throw new Error('Application not found');
    const job = await Job.findById(application.jobId);
    const user = await User.findById(application.userId);
    if (!job || !user) throw new Error('Job or User not found');
    if (!job.applyLink) throw new Error('Job has no apply link');

    let browser;
    try {
        browser = await chromium.launch({ headless: false, slowMo: 50, args: ['--start-maximized'] });
        const context = await browser.newContext({ viewport: null });
        const page = await context.newPage();

        application.status = ApplicationStatus.PROCESSING;
        await application.save();

        // ========== ATS DETECTION & SMART NAVIGATION ==========
        const applyUrl = job.applyLink;
        let detectedATS = 'Unknown';

        // Detect ATS from URL
        if (applyUrl.includes('greenhouse.io') || applyUrl.includes('boards.greenhouse')) {
            detectedATS = 'Greenhouse';
        } else if (applyUrl.includes('lever.co') || applyUrl.includes('jobs.lever')) {
            detectedATS = 'Lever';
        } else if (applyUrl.includes('workday') || applyUrl.includes('myworkday')) {
            detectedATS = 'Workday';
        } else if (applyUrl.includes('ashbyhq.com')) {
            detectedATS = 'Ashby';
        } else if (applyUrl.includes('icims')) {
            detectedATS = 'iCIMS';
        } else if (applyUrl.includes('smartrecruiters')) {
            detectedATS = 'SmartRecruiters';
        }

        console.log(`🔍 Detected ATS: ${detectedATS}`);
        console.log(`Navigating to: ${applyUrl}`);

        await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // ========== ATS-SPECIFIC APPLY BUTTON NAVIGATION ==========
        // Try to find and click the "Apply" button to get to the actual application form
        const applyButtonSelectors = [
            // Greenhouse
            'a[href*="application"]',
            'button:has-text("Apply for this job")',
            'a:has-text("Apply for this job")',
            'button:has-text("Apply Now")',
            'a:has-text("Apply Now")',
            '#apply-button',
            '[data-qa="btn-apply"]',
            // Lever
            'a.postings-btn.template-btn-submit',
            'button:has-text("Apply")',
            'a:has-text("Submit Application")',
            // Generic
            'a.apply-button',
            'button.apply',
            '[href*="#apply"]',
            'a[href*="/apply"]'
        ];

        let clickedApply = false;
        for (const selector of applyButtonSelectors) {
            try {
                const btn = page.locator(selector).first();
                if (await btn.count() > 0 && await btn.isVisible()) {
                    console.log(`🖱️ Clicking Apply button: ${selector}`);
                    await btn.click();
                    await page.waitForTimeout(3000);
                    clickedApply = true;
                    break;
                }
            } catch (e) { }
        }

        if (!clickedApply) {
            // Try appending #app or /apply to the URL
            if (detectedATS === 'Greenhouse' && !applyUrl.includes('application')) {
                const appUrl = applyUrl.includes('#') ? applyUrl : applyUrl + '#app';
                console.log(`🔗 Navigating to Greenhouse apply form: ${appUrl}`);
                await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(2000);
            }
        }

        console.log(`📋 ATS: ${detectedATS} | Ready to fill form...`);
        await page.waitForTimeout(2000);

        // Prepare Data
        const firstName = user.name.split(' ')[0];
        const lastName = user.name.split(' ').slice(1).join(' ') || firstName;

        let whyUsEssay = user.essayAnswers?.whyExcited || "";
        if (user.preferences?.autoGenerateEssays) {
            try { whyUsEssay = await generateEssay(job._id.toString(), user._id.toString()); } catch (e) { }
        }

        const extendedMappings: [RegExp, string][] = [
            [/First.*Name|Given.*Name/i, firstName],
            [/Last.*Name|Family.*Name/i, lastName],
            [/Full.*Name/i, user.name],
            [/Email/i, user.email],
            [/Phone|Mobile/i, user.personalDetails?.phone || ''],
            [/Address|Street/i, user.personalDetails?.address || ''],
            [/City|Town/i, user.personalDetails?.city || ''],
            [/State|Province/i, user.personalDetails?.state || ''],
            [/Zip|Postal/i, user.personalDetails?.zip || ''],
            [/LinkedIn/i, user.personalDetails?.linkedin || ''],
            [/GitHub|Portfolio/i, user.personalDetails?.github || ''],

            // Education
            [/School|University/i, user.personalDetails?.university || ''],
            [/Degree|Major/i, user.personalDetails?.degree || ''],
            [/Discipline|Major|Field.*Study/i, user.personalDetails?.degree ? (user.personalDetails.degree.includes('Science') ? 'Computer Science' : user.personalDetails.degree) : 'Computer Science'],
            [/GPA/i, user.personalDetails?.gpa || ''],

            // Questions
            [/How.*hear|Source/i, user.essayAnswers?.howDidYouHear || 'LinkedIn'],
            [/Why.*excited|Motivation/i, whyUsEssay],
            [/Sponsorship/i, user.commonReplies?.sponsorship || 'No'],
            [/Authorized.*work/i, user.commonReplies?.workAuth || 'Yes'],
            [/Relocat/i, user.commonReplies?.relocation || 'Yes'],
            [/Commut|Proximity/i, 'Yes'],

            // Demographics / Compliance
            [/Gender/i, user.demographics?.gender || 'Male'],
            [/Race|Ethnicity/i, user.demographics?.race || 'Black'],
            [/Veteran/i, user.demographics?.veteran || 'I am not a protected veteran'],
            [/Disability/i, user.demographics?.disability || 'No'],
            [/Hispanic/i, user.demographics?.hispanicLatino || 'No'],

            // Custom
            [/Pronoun/i, user.customAnswers?.pronouns || 'He/Him'],
            [/Confidence.*Scale/i, ''] // Skip
        ];

        // --- FRAME PROCESSING ---
        const frames = page.frames();
        console.log(`Found ${frames.length} frames. Scanning...`);
        let formFilledInAnyFrame = false;

        for (const frame of frames) {
            try {
                // 1. Resume Upload
                let resumePath = null;
                if (application.tailoredPdfUrl) resumePath = path.join(process.cwd(), application.tailoredPdfUrl.replace(/^\//, ''));
                else if (user.resumes?.length) resumePath = path.join(process.cwd(), user.resumes[0].path.replace(/^\//, ''));

                if (resumePath && fs.existsSync(resumePath)) {
                    const fileInput = frame.locator('input[type="file"]');
                    if (await fileInput.count() > 0) {
                        await fileInput.first().setInputFiles(resumePath);
                        await page.waitForTimeout(2000);
                        console.log(`📄 Uploaded resume`);
                    }
                }

                // 2. Smart Fill Logic (Text + Dropdowns)
                const smartFill = async (pattern: RegExp, value: string) => {
                    if (!value) return;
                    try {
                        // Standard Input/Select
                        const el = frame.getByLabel(pattern).first();
                        if (await el.count() > 0 && await el.isVisible()) {
                            const tag = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => '');
                            if (tag === 'select') {
                                // Try simple select
                                await el.selectOption({ label: value }).catch(() => el.selectOption({ value: value }));
                                formFilledInAnyFrame = true;
                                console.log(`🎯 [SIMPLE_FILL] Select ${value} for ${pattern}`);
                                return;
                            } else if (tag === 'input' || tag === 'textarea') {
                                await el.fill(value);
                                formFilledInAnyFrame = true;
                                console.log(`📝 [SIMPLE_FILL] Filled ${value} for ${pattern}`);
                                return;
                            }
                        }

                        // Try Custom Select
                        const customSuccess = await handleCustomSelect(frame, pattern, value);
                        if (customSuccess) {
                            formFilledInAnyFrame = true;
                            return;
                        }

                        // Try Typeahead
                        const typeSuccess = await handleTypeahead(frame, pattern, value);
                        if (typeSuccess) {
                            formFilledInAnyFrame = true;
                        }
                    } catch (e) { }
                };

                for (const [regex, val] of extendedMappings) {
                    await smartFill(regex, val);
                }

                // 3. Special Employment Date Handling (Month/Year)
                // This targets "Start Month", "End Year" specifically
                const dateMappings: [RegExp, string][] = [
                    [/Start.*Month/i, "August"], // Fallback or logic needed? For auto-applier generally we might just pick "January" or use current month if not specified. But usually this comes from user profile.
                    // The user profile has 'structuredExperience'. We should ideally loop over "Add Employment" sections.
                    // But for generic "Start Date Month" fields not in a repeater:
                ];


            } catch (e) { }
        }

        // F. EMPLOYMENT SECTION REPEATER (The complex part)
        for (const frame of frames) {
            const addBtn = frame.getByText(/Add.*Employment|Add.*Experience/i);
            if (await addBtn.count() > 0) {
                // Try to fill at least one recent job
                const emp = user.structuredExperience?.experience?.[0];
                if (emp) {
                    // Try to fill generic "Company", "Title" in this frame if visible
                    await frame.getByLabel(/Company|Employer/i).first().fill(emp.company).catch(() => { });
                    await frame.getByLabel(/Title|Role/i).first().fill(emp.role).catch(() => { });
                    // Dates...
                }
            }
        }

        // Consent Checkboxes
        for (const frame of frames) {
            const boxes = frame.locator('input[type="checkbox"]');
            for (const box of await boxes.all()) {
                if (await box.isVisible()) {
                    const id = await box.getAttribute('id');
                    const label = id ? await frame.locator(`label[for="${id}"]`).innerText().catch(() => '') : '';
                    if (/agree|consent|certify|privacy/i.test(label)) await box.check();
                }
            }
        }


        // ========== 5 MINUTE MANUAL REVIEW PERIOD ==========
        // Use a robust loop instead of single waitForTimeout to handle navigation/closure
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ FORM FILLED - 5 MINUTE MANUAL REVIEW PERIOD STARTED    ║');
        console.log('║  👆 Review and submit the application in the browser       ║');
        console.log('║  ⏰ Browser will close automatically after 5 minutes       ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');

        const REVIEW_DURATION_MS = 5 * 60 * 1000; // 5 minutes
        const CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
        const startTime = Date.now();

        // Keep browser open for 5 minutes, checking periodically if page is still valid
        let browserStillOpen = true;
        while (browserStillOpen && (Date.now() - startTime) < REVIEW_DURATION_MS) {
            try {
                // Check if page is still accessible
                const url = await page.url();
                const remainingSeconds = Math.ceil((REVIEW_DURATION_MS - (Date.now() - startTime)) / 1000);

                // Log progress every 30 seconds
                if (remainingSeconds % 30 === 0 || remainingSeconds <= 10) {
                    console.log(`⏱️ Review time remaining: ${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`);
                }

                // Check if user navigated to a "thank you" or "success" page (application submitted)
                if (/thank|success|confirm|submitted|received/i.test(url) || /thank|success|confirm|submitted/i.test(await page.title().catch(() => ''))) {
                    console.log('🎉 Application appears to be submitted! (Detected success page)');
                    break;
                }

                await page.waitForTimeout(CHECK_INTERVAL_MS);
            } catch (e: any) {
                // Page or browser was closed by user
                if (e.message?.includes('closed') || e.message?.includes('Target')) {
                    console.log('🔒 Browser was closed by user - ending review period');
                    browserStillOpen = false;
                } else {
                    console.log(`⚠️ Review check error: ${e.message}`);
                }
            }
        }

        if (browserStillOpen) {
            console.log('✅ 5-minute review period complete. Marking as APPLIED.');
        }

        application.status = ApplicationStatus.APPLIED;
        application.appliedAt = new Date();
        await application.save();

    } catch (error) {
        console.error('Auto-Apply Failed:', error);
        application.status = ApplicationStatus.ACTION_NEEDED;
        await application.save();
    } finally {
        if (browser) {
            console.log('🔒 Closing browser...');
            await browser.close().catch(() => { });
        }
    }
};
