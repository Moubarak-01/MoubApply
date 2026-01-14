import { chromium, Frame, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { User, IUser } from '../models/User.schema';
import { Job } from '../models/Job.schema';
import { Application, ApplicationStatus } from '../models/Application.schema';
import { generateEssay } from './aiMatcher';
import { matchFieldValue, getEmploymentEntry, getEducationEntry, FormField } from './aiFieldMatcher';

/**
 * Scrape all visible form fields from a frame
 */
async function scrapeFormFields(frame: Frame): Promise<FormField[]> {
    const fields: FormField[] = [];

    try {
        // Scrape inputs
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

        // Scrape selects (dropdowns)
        const selects = await frame.locator('select:visible').all();
        for (const select of selects) {
            const label = await getFieldLabel(frame, select);
            const options = await select.locator('option').allInnerTexts();
            fields.push({
                type: 'select',
                label,
                options: options.filter(o => o.trim() !== '' && !o.toLowerCase().includes('select')),
                name: await select.getAttribute('name') || '',
                id: await select.getAttribute('id') || '',
                isRequired: await select.getAttribute('required') !== null
            });
        }

        // Scrape textareas
        const textareas = await frame.locator('textarea:visible').all();
        for (const textarea of textareas) {
            const label = await getFieldLabel(frame, textarea);
            fields.push({
                type: 'textarea',
                label,
                placeholder: await textarea.getAttribute('placeholder') || '',
                name: await textarea.getAttribute('name') || '',
                id: await textarea.getAttribute('id') || '',
                isRequired: await textarea.getAttribute('required') !== null
            });
        }
    } catch (e) {
        // Ignore frame access errors
    }

    return fields;
}

/**
 * Get the label text for a form field
 */
async function getFieldLabel(frame: Frame, element: any): Promise<string> {
    try {
        // Try aria-label
        const ariaLabel = await element.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;

        // Try associated label via 'for' attribute
        const id = await element.getAttribute('id');
        if (id) {
            const label = await frame.locator(`label[for="${id}"]`).first();
            if (await label.count() > 0) {
                return await label.innerText();
            }
        }

        // Try parent label
        const parentLabel = await element.locator('xpath=ancestor::label').first();
        if (await parentLabel.count() > 0) {
            return await parentLabel.innerText();
        }

        // Try nearby label (previous sibling or wrapper)
        const name = await element.getAttribute('name') || '';
        const placeholder = await element.getAttribute('placeholder') || '';
        return name || placeholder || 'Unknown';
    } catch (e) {
        return 'Unknown';
    }
}

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

        // NEW: Track fields we couldn't match for AI fallback
        const unmatchedFields: { frame: Frame; field: FormField; element: any }[] = [];

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

        // E. AI FALLBACK: Scrape remaining unfilled fields and use AI to match
        console.log('🤖 [AI_FILL] Starting AI-powered field matching for complex fields...');
        for (const frame of frames) {
            try {
                const scrapedFields = await scrapeFormFields(frame);
                console.log(`📋 [AI_FILL] Found ${scrapedFields.length} form fields in frame`);

                for (const field of scrapedFields) {
                    // Skip if likely already filled by hardcoded logic
                    const fieldId = field.id || field.name || '';

                    try {
                        // Get the element
                        let element;
                        if (field.type === 'select') {
                            element = fieldId ? frame.locator(`#${fieldId}`).first() : frame.getByLabel(new RegExp(field.label.slice(0, 20), 'i')).first();
                        } else {
                            element = fieldId ? frame.locator(`#${fieldId}`).first() : frame.getByLabel(new RegExp(field.label.slice(0, 20), 'i')).first();
                        }

                        if (await element.count() === 0) continue;
                        if (!(await element.isVisible())) continue;

                        // Check if already has value
                        const currentValue = await element.inputValue().catch(() => '');
                        if (currentValue && currentValue.length > 0) continue; // Already filled

                        // Use AI matcher
                        const matchResult = await matchFieldValue(field, user);

                        if (matchResult.value && matchResult.value !== '') {
                            if (field.type === 'select') {
                                // For dropdowns, try to match the option
                                const options = await element.locator('option').allInnerTexts();
                                const valueStr = String(matchResult.value).toLowerCase();
                                const bestOption = options.find((opt: string) =>
                                    opt.toLowerCase().includes(valueStr) || valueStr.includes(opt.toLowerCase())
                                );
                                if (bestOption) {
                                    await element.selectOption({ label: bestOption });
                                    console.log(`🎯 [AI_FILL] Dropdown "${field.label}" → "${bestOption}" (${matchResult.source})`);
                                }
                            } else if (field.type === 'checkbox') {
                                if (matchResult.value === true) {
                                    await element.check();
                                    console.log(`☑️ [AI_FILL] Checked "${field.label}" (${matchResult.source})`);
                                }
                            } else {
                                await element.fill(String(matchResult.value));
                                console.log(`📝 [AI_FILL] Filled "${field.label}" → "${String(matchResult.value).slice(0, 30)}..." (${matchResult.source})`);
                            }
                            formFilledInAnyFrame = true;
                        }
                    } catch (fieldErr) {
                        // Individual field errors don't stop the process
                    }
                }
            } catch (frameErr) {
                // Frame access errors are normal for cross-origin
            }
        }

        // F. EMPLOYMENT SECTION: Handle "Add Employment" patterns
        console.log('💼 [EMPLOYMENT] Checking for employment sections...');
        for (const frame of frames) {
            try {
                // Look for employment-related buttons or sections
                const addEmploymentBtn = frame.getByText(/Add.*Employment|Add.*Experience|Add.*Another/i);
                if (await addEmploymentBtn.count() > 0 && await addEmploymentBtn.first().isVisible()) {
                    // Get user employment entries
                    let empIndex = 0;
                    let emp = getEmploymentEntry(user, empIndex);

                    while (emp) {
                        console.log(`💼 [EMPLOYMENT] Filling entry ${empIndex + 1}: ${emp.company}`);

                        // Fill employment fields (common patterns)
                        await frame.getByLabel(/Company.*Name|Employer/i).first().fill(emp.company).catch(() => { });
                        await frame.getByLabel(/Title|Position|Role/i).first().fill(emp.title).catch(() => { });
                        await frame.getByLabel(/Start.*Month/i).first().selectOption({ label: emp.startMonth }).catch(() => { });
                        await frame.getByLabel(/Start.*Year/i).first().selectOption({ label: emp.startYear }).catch(() => { });
                        await frame.getByLabel(/End.*Month/i).first().selectOption({ label: emp.endMonth }).catch(() => { });
                        await frame.getByLabel(/End.*Year/i).first().selectOption({ label: emp.endYear }).catch(() => { });

                        if (emp.isCurrent) {
                            await frame.getByLabel(/Current.*Role|Present/i).first().check().catch(() => { });
                        }

                        empIndex++;
                        emp = getEmploymentEntry(user, empIndex);

                        // Click "Add Another" if there are more entries
                        if (emp) {
                            await addEmploymentBtn.first().click().catch(() => { });
                            await page.waitForTimeout(1000);
                        }
                    }
                }
            } catch (e) { }
        }

        // G. CONSENT CHECKBOXES: Auto-check all required consent boxes
        console.log('☑️ [CONSENT] Checking consent/agreement boxes...');
        for (const frame of frames) {
            try {
                const consentBoxes = frame.locator('input[type="checkbox"]:visible');
                const count = await consentBoxes.count();

                for (let i = 0; i < count; i++) {
                    try {
                        const checkbox = consentBoxes.nth(i);
                        const isChecked = await checkbox.isChecked();
                        if (!isChecked) {
                            // Get label to identify consent boxes
                            const id = await checkbox.getAttribute('id') || '';
                            const label = id ? await frame.locator(`label[for="${id}"]`).first().innerText().catch(() => '') : '';

                            // Check if it looks like a consent/agreement box
                            if (/agree|consent|certify|acknowledge|confirm|accept|privacy|terms/i.test(label + id)) {
                                await checkbox.check();
                                console.log(`☑️ [CONSENT] Checked: ${label.slice(0, 50)}...`);
                            }
                        }
                    } catch (e) { }
                }
            } catch (e) { }
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
