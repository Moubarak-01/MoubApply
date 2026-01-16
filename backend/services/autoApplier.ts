import { chromium, Frame, Page, Locator } from 'playwright';
import path from 'path';
import fs from 'fs';
import { User, IUser } from '../models/User.schema';
import { Job, IJob } from '../models/Job.schema';
import { Application, IApplication, ApplicationStatus } from '../models/Application.schema';
import { generateEssay } from './aiMatcher';
import { matchOptionWithAI, answerFreeTextWithAI } from './aiQuestionAnswerer';
import { FIELD_PATTERNS, COMMON_SELECTORS, fuzzyMatchOption } from './formSelectors';

// Forward Declarations if needed, but TS handles hoisting for function
// declarations. Arrow functions need care.

// State interface 
interface PageState {
    url: string;
    contentHash: string;
}

/**
 * Main Auto-Apply Logic
 */
export const autoApply = async (applicationId: string) => {
    console.log(`🚀 [AUTO_APPLY] Starting for App ID: ${applicationId}`);

    const application = await Application.findById(applicationId);
    if (!application) throw new Error('Application not found');
    const job = await Job.findById(application.jobId);
    const user = await User.findById(application.userId);
    if (!job || !user) throw new Error('Job or User not found');
    if (!job.applyLink) throw new Error('Job has no apply link');

    // Prepare User Context for AI
    const userContext = {
        resumeText: user.masterResumeText || '',
        personalDetails: user.personalDetails,
        education: user.structuredExperience?.education || [],
        experience: user.structuredExperience?.experience || [],
        skills: user.structuredExperience?.skills || [],
        applicationDefaults: user.applicationDefaults || {}
    };

    let browser;
    try {
        browser = await chromium.launch({
            headless: false,
            slowMo: 50,
            args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
        });
        const context = await browser.newContext({
            viewport: null,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        // --- TELEMETRY: Forward Browser Console to Node Terminal ---
        page.on('console', msg => {
            const type = msg.type();
            if (type === 'error' || type === 'warning' || msg.text().includes('[TELEMETRY]')) {
                console.log(`🖥️ [BROWSER_${type.toUpperCase()}] ${msg.text()}`);
            }
        });

        // Update Status
        application.status = ApplicationStatus.PROCESSING;
        await application.save();

        // ========== ATS DETECTION & SMART NAVIGATION (From Repo) ==========\
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

        console.log(`🔍 [TELEMETRY] Detected ATS: ${detectedATS}`);
        console.log(`🔗 Navigating to: ${applyUrl}`);

        await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // ========== ATS-SPECIFIC APPLY BUTTON NAVIGATION ==========\
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
                    console.log(`🖱️ [TELEMETRY] Clicking Apply button: ${selector}`);
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
                console.log(`🔗 [TELEMETRY] Navigating to Greenhouse apply form: ${appUrl}`);
                await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(2000);
            }
        }

        console.log(`📋 [TELEMETRY] ATS: ${detectedATS} | Ready to fill form...`);
        await page.waitForTimeout(2000);

        const firstName = user.name.split(' ')[0];
        const lastName = user.name.split(' ').slice(1).join(' ');

        // Generate a generic "Why Us" essay to have handy
        // generateEssay takes (jobId, userId)
        const whyUsEssay = await generateEssay(application.jobId.toString(), application.userId.toString());

        const extendedMappings: [RegExp, string][] = [
            [/First.*Name|Given.*Name/i, firstName],
            [/Last.*Name|Family.*Name/i, lastName],
            [/Full.*Name/i, user.name],
            [/Email/i, user.email],
            [/Phone|Mobile/i, user.personalDetails?.phone || ''],
            [/Address|Street/i, user.personalDetails?.address || ''],
            [/City|Town/i, user.personalDetails?.city || ''],
            [/State|Province|Reside in/i, user.personalDetails?.state || ''], // Added "Reside in"
            [/Zip|Postal/i, user.personalDetails?.zip || ''],
            [/LinkedIn/i, user.personalDetails?.linkedin || ''],
            [/GitHub|Portfolio|Website/i, user.personalDetails?.github || user.personalDetails?.portfolio || ''],

            // Education & Student Status
            [/School|University|Institution/i, user.personalDetails?.university || ''],
            [/Degree|Major/i, user.personalDetails?.degree || ''],
            [/Discipline|Major|Field.*Study/i, user.personalDetails?.degree ? (user.personalDetails.degree.includes('Science') ? 'Computer Science' : user.personalDetails.degree) : 'Computer Science'],
            [/GPA/i, user.personalDetails?.gpa || ''],
            [FIELD_PATTERNS.isStudent, user.applicationDefaults?.currentlyEnrolled || 'No'],
            [FIELD_PATTERNS.degreeLevel, user.applicationDefaults?.degreeLevel || 'Bachelor\'s'],
            [FIELD_PATTERNS.gradDate, user.applicationDefaults?.expectedGraduation || '2026'],

            // Questions
            [/How.*hear|Source/i, user.essayAnswers?.howDidYouHear || 'LinkedIn'],
            [/Why.*excited|Motivation|Which.*project/i, whyUsEssay], // Added "Which project" for custom essays
            [FIELD_PATTERNS.sponsorship, user.applicationDefaults?.needSponsorship || 'No'],
            [FIELD_PATTERNS.workAuth, user.applicationDefaults?.workAuthorization || 'Yes'],
            [FIELD_PATTERNS.remote, user.applicationDefaults?.remoteOK || 'Yes'],
            [/Relocat/i, user.applicationDefaults?.willingToRelocate || 'Yes'],
            [/Commut|Proximity/i, 'Yes'],

            // Demographics / Compliance
            [FIELD_PATTERNS.gender, user.demographics?.gender || 'Male'],
            [FIELD_PATTERNS.race, user.demographics?.race || 'Black'],
            [FIELD_PATTERNS.veteran, user.demographics?.veteran || 'I am not a protected veteran'],
            [FIELD_PATTERNS.disability, user.demographics?.disability || 'No'],
            [/Hispanic/i, user.demographics?.hispanicLatino || 'No'],

            // Custom
            [/Pronoun/i, user.customAnswers?.pronouns || 'He/Him']
        ];

        // --- PHASE 4: MULTI-PAGE LOOP ---
        const visitedStates: PageState[] = [];
        let consecutiveNoOps = 0;
        const MAX_STEPS = 20;

        for (let step = 0; step < MAX_STEPS; step++) {
            console.log(`\n🔄 [STEP ${step + 1}] Analyzing page...`);

            // 1. CAPTCHA Detection (Phase 5)
            if (await detectCaptcha(page)) {
                console.warn('🚨 CAPTCHA DETECTED! Pausing for manual intervention...');
                // TODO: Emit socket event here
                await page.waitForTimeout(15000); // Give user 15s to solve?
            }

            // 2. Loop Detection
            const currentState = { url: page.url(), contentHash: await page.evaluate(() => document.body.innerText.length.toString()) };
            if (visitedStates.some(s => s.url === currentState.url && s.contentHash === currentState.contentHash && consecutiveNoOps > 2)) {
                console.log('🛑 Loop detected (stuck on same page). Breaking.');
                break;
            }
            visitedStates.push(currentState);

            // --- FRAME PROCESSING ---
            const frames = page.frames();
            console.log(`\n🔎 [TELEMETRY] Scanning ${frames.length} frames for fields...`);
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
                            // Only upload if empty
                            if (await fileInput.evaluate(e => (e as HTMLInputElement).files?.length === 0)) {
                                await fileInput.first().setInputFiles(resumePath);
                                await page.waitForTimeout(2000);
                                console.log(`📄 [TELEMETRY] Uploaded resume: ${path.basename(resumePath)}`);
                            }
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
                                    console.log(`✅ [TELEMETRY] Selected "${value}" for /${pattern.source}/`);
                                    return;
                                } else if (tag === 'input' || tag === 'textarea') {
                                    // Check if it's already filled
                                    const currentVal = await el.inputValue();
                                    if (!currentVal) {
                                        await el.fill(value);
                                        formFilledInAnyFrame = true;
                                        console.log(`✍️ [TELEMETRY] Filled "${value}" for /${pattern.source}/`);
                                    }
                                    return;
                                }
                            }

                            // Try Custom Select (Greenhouse often uses <a> or <span> for triggers)
                            // Greenhouse specific: .select2-container or similar
                            const customSuccess = await handleCustomSelect(frame, pattern, value);
                            if (customSuccess) {
                                formFilledInAnyFrame = true;
                                // Logged in helper
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
                } catch (frameError) {
                    console.error(`Error processing frame: ${frame.url()} - ${frameError}`);
                }
            }

            // 4. Submit / Next Navigation
            if (formFilledInAnyFrame) {
                consecutiveNoOps = 0;
                const moved = await clickNextOrSubmit(page);
                if (!moved) consecutiveNoOps++;
            } else {
                consecutiveNoOps++;
                console.log('⚠️ No fields matched or filled this step.');

                // If we didn't fill anything, maybe we just need to click next?
                const moved = await clickNextOrSubmit(page);
                if (!moved) {
                    // Check for success text before giving up
                    if (await checkForSuccess(page)) {
                        console.log('🎉 Success detected!');
                        break;
                    }
                    if (consecutiveNoOps > 3) {
                        console.log('🛑 Stuck for 3 steps. Stopping.');
                        break;
                    }
                }
            }

            await page.waitForTimeout(3000); // Wait for nav
        }

        // Final Status Update
        await finalizeApplication(page, application);

    } catch (error) {
        console.error('❌ Auto-Apply Critical Error:', error);
        application.status = ApplicationStatus.ACTION_NEEDED;
        await application.save();
    } finally {
        if (browser) await browser.close();
    }
};

/**
 * core logic to fill a single frame (recursively handles iframes?)
 * No, Playwright flat list is easier.
 */
async function fillFrame(frame: Frame, user: IUser, context: any, job: IJob): Promise<boolean> {
    let activity = false;

    // A. Resume Upload
    const fileInput = frame.locator('input[type="file"]');
    if (await fileInput.count() > 0 && await fileInput.isVisible()) {
        const resumePath = getResumePath(user);
        if (resumePath) {
            // Only upload if empty?
            if (await fileInput.evaluate(e => (e as HTMLInputElement).files?.length === 0)) {
                await fileInput.setInputFiles(resumePath);
                console.log('📄 Uploaded Resume');
                activity = true;
            }
        }
    }

    // B. Inputs & Textareas
    const inputs = await frame.locator('input:not([type="hidden"]):not([type="submit"]):not([type="file"]), textarea').all();
    for (const input of inputs) {
        if (!(await input.isVisible())) continue;
        const val = await input.inputValue();
        if (val) continue; // Skip filled

        const label = await getLabel(frame, input);
        const match = await matchField(label, input, user, context, job);

        if (match) {
            await input.fill(match);
            console.log(`✏️ Filled "${label}": ${match}`);
            activity = true;
        }
    }

    // C. Selects & Dropdowns (Phase 3)
    const selects = await frame.locator('select').all();
    for (const select of selects) {
        if (!(await select.isVisible())) continue;
        const val = await select.inputValue();
        if (val) continue; // Skip filled

        const label = await getLabel(frame, select);
        const options = await select.locator('option').allInnerTexts();
        const validOptions = options.filter(o => o.trim() !== '');

        // 1. Regex/Heuristic Match
        let targetValue = await determineTargetValue(label, user, context);

        // 2. Fuzzy Match with Options
        let bestOption = fuzzyMatchOption(validOptions, targetValue);

        // 3. AI Fallback (Phase 2 integration)
        if (!bestOption && targetValue) {
            console.log(`🤖 AI Matching for dropdown: "${label}"...`);
            bestOption = await matchOptionWithAI(`Select the best option for "${label}"`, validOptions, context);
        }

        if (bestOption) {
            await select.selectOption({ label: bestOption }).catch(() => select.selectOption({ value: bestOption }));
            console.log(`🔽 Selected "${label}": ${bestOption}`);
            activity = true;
        }
    }

    // D. Radios (Complex grouping)
    // Simplified: Find radios by label and click
    // This is hard to do generically without semantic grouping, skipping for MVP robustness

    // E. Checkboxes (Consent)
    const checkboxes = await frame.locator('input[type="checkbox"]').all();
    for (const box of checkboxes) {
        const label = await getLabel(frame, box);
        if (/agree|consent|certify|privacy|terms/i.test(label) && !(await box.isChecked())) {
            await box.check();
            console.log(`☑️ Checked consent: "${label}"`);
            activity = true;
        }
    }

    return activity;
}

/**
 * Handle custom dropdowns (divs/buttons that act like selects)
 * Strategy: Click trigger -> Wait for list -> Click option
 */
async function handleCustomSelect(frame: Frame, labelRegex: RegExp, targetValue: string): Promise<boolean> {
    if (!targetValue) return false;

    try {
        // 1. Find the Trigger Element
        // Greenhouse uses <a> tags often for Select2 triggers
        const trigger = frame.locator('a, button, div.select2-container').filter({ hasText: labelRegex }).first();
        // Fallback: Label pointing to a container
        let actualTrigger = trigger;

        if (await trigger.count() === 0) {
            const label = frame.getByLabel(labelRegex).first();
            if (await label.count() > 0) {
                // Check if label points to a hidden input, and find sibling structure
                const id = await label.getAttribute('for');
                if (id) {
                    // Greenhouse specific: Select2 container is usually adjacent to the select or derived from it
                    // Or just click the container that *looks* like the dropdown
                    const container = frame.locator(`#s2id_${id}, .select2-container`).first();
                    if (await container.count() > 0) actualTrigger = container;
                }
            }
        }

        // Broad search if still not found
        if (await actualTrigger.count() === 0) {
            actualTrigger = frame.getByLabel(labelRegex).first();
        }

        if (await actualTrigger.count() === 0 || !(await actualTrigger.isVisible())) {
            return false;
        }

        // Avoid inputs/selects (we handle those in smartFill)
        const tagName = await actualTrigger.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return false;

        console.log(`🖱️ [TELEMETRY] Clicking custom dropdown for /${labelRegex.source}/`);
        await actualTrigger.click();
        await frame.page().waitForTimeout(1000); // Wait for animation

        // 2. Find the Option (Exact or Partial) - IMPROVED
        // Greenhouse/Select2 usually puts options in a div at the END of the specific frame or body
        const optionText = targetValue;

        // Strategy A: Click Text Exact
        let option = frame.locator(`li, div.select2-result-label`).filter({ hasText: new RegExp(`^${optionText}$`, 'i') }).first();

        // Strategy B: Click Text Contains
        if (await option.count() === 0) {
            option = frame.locator(`li, div.select2-result-label`).filter({ hasText: optionText }).first();
        }

        // Strategy C: Fuzzy / AI Choice (Binary)
        if (await option.count() === 0 && (['yes', 'no'].includes(optionText.toLowerCase()))) {
            option = frame.locator(`li, div.select2-result-label`).filter({ hasText: new RegExp(optionText, 'i') }).first();
        }

        if (await option.count() > 0 && await option.isVisible()) {
            await option.click();
            console.log(`✅ [TELEMETRY] Custom Select: Clicked "${targetValue}"`);
            return true;
        }

        // Check for general visible text in the frame if not found in list
        // Sometimes options are just 'div's with text
        if (await option.count() === 0) {
            const visibleText = frame.getByText(targetValue).first();
            if (await visibleText.count() > 0 && await visibleText.isVisible()) {
                await visibleText.click();
                console.log(`✅ [TELEMETRY] Custom Select: Clicked visible text "${targetValue}"`);
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

async function handleTypeahead(frame: Frame, labelRegex: RegExp, value: string): Promise<boolean> {
    try {
        const input = frame.getByLabel(labelRegex).first();
        if (await input.count() > 0 && await input.isVisible()) {
            await input.fill(value);
            await frame.page().waitForTimeout(1000);
            // Click first suggestion
            const suggestion = frame.locator('.tt-suggestion, .ui-menu-item, li[role="option"]').first();
            if (await suggestion.count() > 0 && await suggestion.isVisible()) {
                await suggestion.click();
                console.log(`✅ [TELEMETRY] Typeahead: Selected suggestion for "${value}"`);
                return true;
            }
            // Or press Enter
            await input.press('Enter');
            return true;
        }
    } catch (e) { }
    return false;
}

/**
 * Determine the best value for a field based on user data
 */
async function determineTargetValue(label: string, user: IUser, context: any): Promise<string> {
    const l = label.toLowerCase();

    // Direct Mappings (Phase 6)
    if (FIELD_PATTERNS.firstName.test(l)) return user.name.split(' ')[0];
    if (FIELD_PATTERNS.lastName.test(l)) return user.name.split(' ').slice(1).join(' ');
    if (FIELD_PATTERNS.email.test(l)) return user.email;
    if (FIELD_PATTERNS.phone.test(l)) return user.personalDetails?.phone || '';
    if (FIELD_PATTERNS.linkedin.test(l)) return user.personalDetails?.linkedin || '';
    if (FIELD_PATTERNS.website.test(l)) return user.personalDetails?.portfolio || user.personalDetails?.github || '';

    // Application Defaults
    if (FIELD_PATTERNS.workAuth.test(l)) return user.applicationDefaults?.workAuthorization || 'Yes';
    if (FIELD_PATTERNS.sponsorship.test(l)) return user.applicationDefaults?.needSponsorship || 'No'; // Added
    if (FIELD_PATTERNS.salary.test(l)) return 'Negotiable';
    if (FIELD_PATTERNS.gender.test(l)) return user.demographics?.gender || '';
    if (FIELD_PATTERNS.race.test(l)) return user.demographics?.race || '';
    if (FIELD_PATTERNS.veteran.test(l)) return user.demographics?.veteran || '';
    if (FIELD_PATTERNS.disability.test(l)) return user.demographics?.disability || '';
    if (FIELD_PATTERNS.remote.test(l)) return user.applicationDefaults?.remoteOK || 'Yes'; // Added
    if (FIELD_PATTERNS.isStudent.test(l)) return user.applicationDefaults?.currentlyEnrolled || 'No'; // Added
    if (FIELD_PATTERNS.gradDate.test(l)) return user.applicationDefaults?.expectedGraduation || '2026'; // Added

    if (FIELD_PATTERNS.gradDate.test(l)) return user.applicationDefaults?.expectedGraduation || '2026';

    // Special Case: Essay/Long Form Questions
    // e.g. "Why are you interested?", "Describe a challenge...", "Which project..."
    if (/why|describe|tell\s*us|explain|challenge|project|excite/i.test(l)) {
        console.log(`🧠 [AI_THINK] Generating long answer for: "${label}"`);
        return await answerFreeTextWithAI(label, context, 600);
    }

    // AI Q&A Fallback (Short)
    return await answerFreeTextWithAI(label, context, 150);
}


async function matchField(label: string, element: Locator, user: IUser, context: any, job: IJob): Promise<string> {
    return determineTargetValue(label, user, context);
}

/**
 * Helper to get label text
 */
async function getLabel(frame: Frame, element: Locator): Promise<string> {
    const id = await element.getAttribute('id');
    if (id) {
        const label = frame.locator(`label[for="${id}"]`);
        if (await label.count()) return await label.innerText();
    }
    const aria = await element.getAttribute('aria-label');
    if (aria) return aria;
    return await element.getAttribute('name') || '';
}

/**
 * Detect CAPTCHA presence
 */
async function detectCaptcha(page: Page): Promise<boolean> {
    const iframes = page.frames();
    for (const frame of iframes) {
        if (frame.url().includes('recaptcha') || frame.url().includes('hcaptcha') || frame.url().includes('turnstile')) {
            return true;
        }
    }
    return await page.locator('#g-recaptcha-response, .g-recaptcha, iframe[src*="captcha"]').count() > 0;
}

/**
 * Click Next or Submit
 */
async function clickNextOrSubmit(page: Page): Promise<boolean> {
    const nextBtns = page.locator('button, input[type="submit"], input[type="button"], a.btn').filter({ hasText: FIELD_PATTERNS.next });
    if (await nextBtns.count() > 0 && await nextBtns.first().isVisible()) {
        await nextBtns.first().click();
        console.log('➡️ Clicked Next');
        return true;
    }

    const submitBtns = page.locator('button, input[type="submit"]').filter({ hasText: FIELD_PATTERNS.submit });
    if (await submitBtns.count() > 0 && await submitBtns.first().isVisible()) {
        await submitBtns.first().click();
        console.log('📨 Clicked Submit');
        return true;
    }

    return false;
}

async function checkForSuccess(page: Page): Promise<boolean> {
    const text = await page.evaluate(() => document.body.innerText.toLowerCase());
    return text.includes('application submitted') || text.includes('thank you for applying') || text.includes('successfully sent');
}

function getResumePath(user: IUser): string | null {
    if (user.resumes && user.resumes.length > 0) {
        // Assume first resume is default
        return path.resolve(process.cwd(), 'uploads', user.resumes[0].filename);
    }
    return null;
}

async function finalizeApplication(page: Page, app: IApplication) {
    if (await checkForSuccess(page)) {
        app.status = ApplicationStatus.APPLIED;
        app.appliedAt = new Date();
    } else {
        // Leave for manual review
        // In a real headless mode, we'd mark ACTION_NEEDED, but for headful we let user finish
        app.status = ApplicationStatus.ACTION_NEEDED;
    }
    await app.save();
}
