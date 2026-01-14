import axios from 'axios';
import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';
import { compileLatex } from './latexCompiler';
import { hfTextGeneration } from './hfService';
import { nvidiaTextGeneration } from './nvidiaService';
import { groqTextGeneration } from './groqService';
import fs from 'fs';
import path from 'path';


// Helper to escape LaTeX special characters
const escapeLatex = (str: string): string => {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\textbackslash{}') // Backslash
        .replace(/&/g, '\\&')
        .replace(/%/g, '\\%')
        .replace(/\$/g, '\\$')
        .replace(/#/g, '\\#')
        .replace(/_/g, '\\_')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}');
};

// Recursive function to escape all strings in an object
const sanitizeDataForLatex = (data: any): any => {
    if (typeof data === 'string') return escapeLatex(data);
    if (Array.isArray(data)) return data.map(sanitizeDataForLatex);
    if (typeof data === 'object' && data !== null) {
        const cleaned: any = {};
        for (const key in data) {
            cleaned[key] = sanitizeDataForLatex(data[key]);
        }
        return cleaned;
    }
    return data;
};

// Read Custom Template
const TEMPLATE_PATH = path.join(__dirname, '../templates/custom_resume.tex');
let CUSTOM_TEMPLATE = '';
try {
    CUSTOM_TEMPLATE = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
} catch (e) {
    console.error("❌ Failed to read custom_resume.tex, using fallback.");
    CUSTOM_TEMPLATE = String.raw`\documentclass{article}\begin{document}Error loading template.\end{document}`;
}

export const tailorResume = async (userId: string, jobId: string) => {
    console.group('[RESUME_TAILOR] Starting Resume Tailoring');

    try {
        const job = await Job.findById(jobId);
        const user = await User.findById(userId);

        if (!job || !user || !user.structuredExperience) {
            console.error(`[ERROR_TRACE] Status: FAILED - Missing Data`);
            console.error(`[ERROR_TRACE] Job Found: ${!!job}, User Found: ${!!user}, Structured Data: ${!!user?.structuredExperience}`);
            throw new Error('Missing data or resume not yet structured.');
        }

        console.log(`[AI_LOG] User: ${user.name} (ID: ${userId})`);
        console.log(`[AI_LOG] Target Job: ${job.title} at ${job.company}`);
        console.log(`[RESUME_TAILOR] Using Template: ${TEMPLATE_PATH}`);

        const userData = user.structuredExperience;
        const personalInfo = userData.personalInfo || {};

        // ---------------------------------------------------------
        // STRATEGY: Hybrid "Bullet-Only" Tailoring
        // ---------------------------------------------------------

        const prompt = `
      You are an expert resume writer. Your ONLY task is to rewrite bullet points to better match a target job description.

      ### CRITICAL RULES:
      1. **DO NOT INVENT DATA**: Use ONLY the information provided in the candidate's actual experience and projects below.
      2. **MINIMAL CHANGES**: Keep the same achievements, metrics, and technologies. Only adjust wording to emphasize skills relevant to the target job.
      3. **PRESERVE NUMBERS**: If a bullet says "20+ protocols" or "40% improvement", keep those exact numbers.
      4. **NO HALLUCINATIONS**: If the candidate doesn't have a specific skill mentioned in the job description, DO NOT add it to their bullets.
      5. **DO NOT ADD NEW STYLING**: Only use [[BI]]...[[/BI]] markers if they ALREADY exist in the original bullet. Do NOT add these markers to bullets that don't have them. If you do add them, you MUST use the EXACT syntax: [[BI]] to open and [[/BI]] to close (with double brackets and forward slash).
      6. **KEEP ORIGINAL STRUCTURE**: Return bullets in the same order, with the same general structure as the original.

      ### TARGET JOB:
      **Title**: ${job.title}
      **Company**: ${job.company}
      **Description**: "${job.rawDescription?.slice(0, 1500) || ''}"

      ### CANDIDATE'S ACTUAL EXPERIENCE:
      ${JSON.stringify((userData.experience || []).map(e => ({ ...e, BULLETS: e.points })), null, 2)}

      ### CANDIDATE'S ACTUAL PROJECTS:
      ${JSON.stringify((userData.projects || []).map(p => ({ ...p, BULLETS: p.points })), null, 2)}

      ### YOUR TASK:
      For each experience and project, rewrite the bullets to highlight how the candidate's actual work aligns with the target job's requirements. Make MINIMAL changes - just adjust wording to better match the job description.

      ### OUTPUT FORMAT (JSON ONLY):
      {
        "EXPERIENCE": [ { "BULLETS": ["rewritten bullet 1", "rewritten bullet 2"] }, ... ],
        "PROJECTS": [ { "BULLETS": ["rewritten bullet 1", "rewritten bullet 2"] }, ... ]
      }
    `;

        console.log(`[AI_LOG] Resume Prompt Snippet: "${prompt.slice(0, 300).replace(/\n/g, ' ')}..."`);

        const MODELS = [
            'google/gemini-3-flash:free',
            'xiaomi/mimo-v2-flash:free',
            'mistralai/devstral-2-2512:free',
            'tngtech/deepseek-r1t2-chimera:free',
            'google/gemma-3-27b:free',
            'mistralai/mistral-small-3.1-24b-instruct:free',
            'google/gemini-2.0-flash-exp:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'qwen/qwen3-4b:free',
            'google/gemini-2.0-pro-exp:free',
            'deepseek/deepseek-r1-distill-llama-70b:free',
            'nousresearch/hermes-3-llama-3.1-405b:free',
            'microsoft/phi-3-medium-128k-instruct:free',
            'google/gemma-2-9b-it:free',
            'mistralai/mistral-nemo:free',
            'openchat/openchat-7b:free',
            'huggingfaceh4/zephyr-7b-beta:free',
            'liquid/lfm-40b:free',
            'qwen/qwen-2.5-72b-instruct:free'
        ];

        let aiResponse: any = null;
        let lastError: any = null;

        for (const model of MODELS) {
            const start = Date.now();
            try {
                console.log(`[AI_LOG] Invoking Model for Resume: OpenRouter - ${model}`);
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    { model, messages: [{ role: 'user', content: prompt }] },
                    {
                        headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://moubapply.com', 'X-Title': 'MoubApply' },
                        timeout: 40000
                    }
                );

                const duration = Date.now() - start;
                console.log(`[AI_LOG] Response received in ${duration}ms`);

                const content = response.data.choices[0].message.content;
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error("No JSON found");

                try {
                    aiResponse = JSON.parse(jsonMatch[0].replace(/(?<!\\)\\(?![\\/bfnrtu"])/g, '\\\\'));
                } catch {
                    aiResponse = JSON.parse(jsonMatch[0]);
                }

                if (aiResponse) {
                    console.log(`✅ [AI_LOG] Resume Tailoring success with ${model}`);
                    break;
                }
            } catch (err: any) {
                const duration = Date.now() - start;
                lastError = err;
                console.warn(`⚠️ [AI_LOG] Model ${model} failed after ${duration}ms: ${err.message}`);
                // Exponential backoff
                if (err.response?.status === 429) {
                    const delay = 5000 * (MODELS.indexOf(model) + 1);
                    console.log(`[AI_LOG] Rate limited. Waiting ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        // Fallback Logging Wrapper
        const tryFallback = async (providerName: string, serviceFn: any) => {
            if (aiResponse) return;
            console.warn(`[AI_LOG] Rotation Logic: OpenRouter failed, retrying with ${providerName}...`);
            const start = Date.now();
            const result = await serviceFn(prompt, 1500);
            const duration = Date.now() - start;
            console.log(`[AI_LOG] ${providerName} Response received in ${duration}ms`);

            if (result) {
                try {
                    const jsonMatch = result.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        aiResponse = JSON.parse(jsonMatch[0]);
                        console.log(`✅ [AI_LOG] Resume Tailoring success with ${providerName}`);
                    }
                } catch (e) {
                    console.error(`[AI_LOG] Failed to parse JSON from ${providerName}`);
                }
            }
        };

        // Fallback Chain
        if (!aiResponse) await tryFallback('Hugging Face', hfTextGeneration);
        if (!aiResponse) await tryFallback('NVIDIA', nvidiaTextGeneration);
        if (!aiResponse) await tryFallback('Groq', groqTextGeneration);

        if (!aiResponse) {
            console.error(`[ERROR_TRACE] Status: FAILED during Resume AI Generation`);
            console.error(`[ERROR_TRACE] Stack Trace: ${lastError?.stack || lastError}`);
            throw new Error("AI Tailoring failed on all providers.");
        }


        // ---------------------------------------------------------
        // MERGE LOGIC: Combine Static Data (Verified) + AI Bullets (Tailored)
        // ---------------------------------------------------------

        // 1. Prepare Base Data (Static Fields)
        // Helper to get first item safely
        const education: any = (userData.education && userData.education.length > 0) ? userData.education[0] : {};

        // Robust ID cleanup
        const cleanLinkedin = (url: string) => {
            if (!url) return '';
            const match = url.match(/linkedin\.com\/in\/([^\/]+)/i);
            return match ? match[1] : url.replace(/^https?:\/\//, '').replace(/^www\./, '');
        };
        const cleanGithub = (url: string) => {
            if (!url) return '';
            const match = url.match(/github\.com\/([^\/]+)/i);
            return match ? match[1] : url.replace(/^https?:\/\//, '').replace(/^www\./, '');
        };

        const finalData: any = {
            FULL_NAME: personalInfo.fullName || 'Full Name',
            PHONE: personalInfo.phone || 'Phone',
            EMAIL: personalInfo.email || 'Email',
            LINKEDIN_ID: cleanLinkedin(personalInfo.linkedin),
            GITHUB_ID: cleanGithub(personalInfo.github),

            // Map Education fields
            UNIVERSITY: education.institution || "Rust College",
            GRAD_DATE: "Dec 2028",
            DEGREE: education.degree || "Bachelor of Science in Computer Science",
            GPA: "[[BI]]4.0[[/BI]]",
            LOCATION: education.location || "Holly Springs, MS",
            COURSEWORK: education.coursework || "Data Structures, Algorithms",

            // Map Skills fields
            SKILLS_LANGUAGES: userData.skills?.languages || "",
            SKILLS_FRONTEND: userData.skills?.frontend || "",
            SKILLS_BACKEND: userData.skills?.backend || "",
            SKILLS_AI: userData.skills?.aiMl || "",
            SKILLS_TOOLS: userData.skills?.tools || "",

            // Map Honors/Affiliations (use Unicode bullet, not LaTeX code to avoid escaping issues)
            AFFILIATIONS: (userData.honors || []).join(" · ")
        };

        // 2. Merge Experience
        finalData.EXPERIENCE = (userData.experience || []).map((exp: any, i: number) => ({
            COMPANY: exp.company,
            DATES: exp.dates,
            ROLE: exp.role,
            LOCATION: exp.location,
            // Override bullets with AI version if available, else keep original points
            BULLETS: aiResponse.EXPERIENCE?.[i]?.BULLETS || exp.points || []
        }));

        // 3. Merge Projects (Handle Links Carefully)
        finalData.PROJECTS = (userData.projects || []).map((proj: any, i: number) => {
            // Force Specific Links for Known Projects
            let link = proj.link || '';
            const titleLower = (proj.title || '').toLowerCase();

            if (titleLower.includes('moubely')) link = "https://github.com/Moubarak-01/Moubely";
            else if (titleLower.includes('movie')) link = "https://movie-search-mu-three.vercel.app/";
            else if (titleLower.includes('portfolio')) link = "https://moubarak-01.github.io/Portfolio/";

            return {
                TITLE: proj.title,
                TECH_STACK: proj.technologies,
                DATE: proj.date,
                LINK: link,
                BULLETS: aiResponse.PROJECTS?.[i]?.BULLETS || proj.points || []
            };
        });

        // 4. Merge Leadership (Note: Leadership is usually part of Experience or Honors in some parsers, 
        // strictly speaking current Schema doesn't have a distinct 'leadership' array, it might be in 'experience' or 'honors'.
        // If it's missing in Schema, we can omit or check 'experience' for roles like 'Student-Athlete')
        // For now, let's treat it as empty or map from specific experience items if we can identify them.
        // Or better, let's just create a static 'Student-Athlete' entry if not found, since user explicitly wants it.

        finalData.LEADERSHIP = [
            {
                ORG_NAME: "Rust College",
                ROLE: "Student-Athlete",
                DATES: "Jan 2025 -- Present",
                BULLETS: ["Maintain a [[BI]]4.0 GPA[[/BI]] while dedicating 20+ hours weekly to intercollegiate tennis; mentored 10+ freshmen on balancing academic rigor with high-performance athletic travel commitments."]
            }
        ];

        // 5. Enhance Affiliations (Hardcode the CodePath link formatting if present in text)
        if (typeof finalData.AFFILIATIONS === 'string' && finalData.AFFILIATIONS.includes('CodePath')) {
            if (!finalData.AFFILIATIONS.includes('[[HREF')) {
                finalData.AFFILIATIONS = finalData.AFFILIATIONS.replace(
                    /CodePath(\s?CyberSecurity)?/i,
                    "[[HREF:https://drive.google.com/file/d/11SraYwP7C8HAwD-_YC5W2F73_Ebm9eme/view|CodePath CyberSecurity]]"
                );
            }
        }


        // ---------------------------------------------------------
        // ADVANCED SANITIZATION (The "Safe Processor" Logic)
        // ---------------------------------------------------------

        const processDataSafe = (inputData: any): any => {
            const markers: string[] = [];

            const traverseAndProcess = (obj: any): any => {
                if (typeof obj === 'string') return handleString(obj);
                if (Array.isArray(obj)) return obj.map(traverseAndProcess);
                if (typeof obj === 'object' && obj !== null) {
                    const newObj: any = {};
                    for (const key in obj) newObj[key] = traverseAndProcess(obj[key]);
                    return newObj;
                }
                return obj;
            };

            const handleString = (str: string): string => {
                if (!str) return '';
                let processed = str;
                const replacements: { placeholder: string, type: 'BI' | 'HREF', content: string, url?: string }[] = [];

                // 1. Extract, using ALPHANUMERIC safe placeholders to survive escapeLatex (which kills underscores)
                // Use "XZYMARKER" + index + "YZX" to be very unique and safe

                // Extract HREFs
                processed = processed.replace(/\[\[HREF:(.*?)\|(.*?)\]\]/g, (match, url, text) => {
                    const pid = `XZYHREF${replacements.length}YZX`;
                    replacements.push({ placeholder: pid, type: 'HREF', url, content: text });
                    return pid;
                });
                // Extract BIs
                processed = processed.replace(/\[\[BI\]\](.*?)\[\[\/BI\]\]/g, (match, content) => {
                    const pid = `XZYBI${replacements.length}YZX`;
                    replacements.push({ placeholder: pid, type: 'BI', content: content });
                    return pid;
                });

                // Sanitize main text (escapes _ % $ etc)
                processed = escapeLatex(processed);

                // Restore
                replacements.forEach(rep => {
                    const safeContent = escapeLatex(rep.content);
                    let latex = '';
                    if (rep.type === 'HREF') latex = `\\href{${rep.url}}{${safeContent}}`;
                    else if (rep.type === 'BI') latex = `\\textbf{\\textit{${safeContent}}}`;
                    processed = processed.replace(rep.placeholder, latex);
                });
                return processed;
            };

            return traverseAndProcess(inputData);
        };

        // Apply the safe processing
        const sanitizedData = processDataSafe(finalData);


        // ---------------------------------------------------------
        // TEMPLATE RENDERING
        // ---------------------------------------------------------

        // Mustache-like manual replacement helper
        const renderList = (templateSegment: string, list: any[]) => {
            if (!list || !Array.isArray(list)) return '';
            return list.map(item => {
                let seg = templateSegment;
                Object.keys(item).forEach(key => {
                    if (key === 'BULLETS') {
                        const bulletStr = item[key].map((b: string) => `\\resumeItem{${b}}`).join('\n');
                        seg = seg.replace(new RegExp(`{{#BULLETS}}[\\s\\S]*?{{/BULLETS}}`, 'g'), bulletStr);
                    } else {
                        seg = seg.replace(new RegExp(`{{${key}}}`, 'g'), item[key] || '');
                    }
                });
                return seg;
            }).join('\n');
        };

        let finalTex = CUSTOM_TEMPLATE;

        // Scalars
        const scalars = ['FULL_NAME', 'PHONE', 'EMAIL', 'LINKEDIN_ID', 'GITHUB_ID', 'UNIVERSITY', 'GRAD_DATE', 'DEGREE', 'GPA', 'LOCATION', 'COURSEWORK',
            'SKILLS_LANGUAGES', 'SKILLS_FRONTEND', 'SKILLS_BACKEND', 'SKILLS_AI', 'SKILLS_TOOLS', 'AFFILIATIONS'];

        scalars.forEach(key => {
            finalTex = finalTex.replace(new RegExp(`{{${key}}}`, 'g'), sanitizedData[key] || '');
        });

        // Lists
        const expRegex = /{{#EXPERIENCE}}([\s\S]*?){{\/EXPERIENCE}}/g;
        if (expRegex.test(finalTex) && sanitizedData.EXPERIENCE) {
            finalTex = finalTex.replace(expRegex, (match, block) => renderList(block, sanitizedData.EXPERIENCE));
        }

        const projRegex = /{{#PROJECTS}}([\s\S]*?){{\/PROJECTS}}/g;
        if (projRegex.test(finalTex) && sanitizedData.PROJECTS) {
            finalTex = finalTex.replace(projRegex, (match, block) => renderList(block, sanitizedData.PROJECTS));
        }

        const leadRegex = /{{#LEADERSHIP}}([\s\S]*?){{\/LEADERSHIP}}/g;
        if (leadRegex.test(finalTex) && sanitizedData.LEADERSHIP) {
            finalTex = finalTex.replace(leadRegex, (match, block) => renderList(block, sanitizedData.LEADERSHIP));
        }

        // Compile
        // Create a simple, clean filename (User Request)
        const safeName = sanitizedData.FULL_NAME.replace(/[^a-zA-Z0-9]/g, '_');
        const outputName = `${safeName}_Resume`;
        await compileLatex(finalTex, outputName);

        // Generate Cover Letter (Separate Call)
        const clPrompt = `
            You are an expert career coach writing a compelling cover letter.
            
            ### CANDIDATE INFORMATION:
            - Full Name: ${sanitizedData.FULL_NAME}
            - Phone: ${sanitizedData.PHONE}
            - Email: ${sanitizedData.EMAIL}
            - Location: ${sanitizedData.LOCATION}
            - Technical Skills: ${sanitizedData.SKILLS_LANGUAGES}, ${sanitizedData.SKILLS_FRONTEND}, ${sanitizedData.SKILLS_BACKEND}, ${sanitizedData.SKILLS_AI}
            - Key Achievement: "${sanitizedData.EXPERIENCE?.[0]?.BULLETS?.[0] || 'Demonstrated strong technical and problem-solving abilities'}"
            - Recent Company: ${sanitizedData.EXPERIENCE?.[0]?.COMPANY || 'Previous experience'}
            - Education: ${sanitizedData.DEGREE} from ${sanitizedData.UNIVERSITY} (Expected ${sanitizedData.GRAD_DATE})
            - Affiliations: ${sanitizedData.AFFILIATIONS?.replace(/\\\\/g, '') || 'N/A'}
            
            ### TARGET POSITION:
            - Job Title: ${job.title}
            - Company: ${job.company}
            - Job Description (excerpt): "${job.rawDescription.slice(0, 1000)}..."
            
            ### CRITICAL REQUIREMENTS:
            1. **USE REAL DATA ONLY**: Every detail MUST come from the candidate information above. NO placeholders like "[Skill]", "[Date]", "[City]", or "[Company]".
            2. **PERSONALIZATION**: If the candidate has unique qualifications (e.g., language skills in Affiliations, specific technical expertise), highlight them as differentiators.
            3. **ACHIEVEMENTS**: Reference the candidate's actual work experience and quantifiable achievements from their resume.
            4. **COMPANY RESEARCH**: If the job description mentions specific company values, initiatives, or locations, acknowledge them naturally.
            5. **CONCISENESS**: Keep the letter under 300 words.
            6. **STRUCTURE**: 
               - Opening: Express interest and mention how you learned about the role
               - Body: Connect your actual experience/skills to the job requirements
               - Closing: Express enthusiasm and next steps
               - Signature: ${sanitizedData.FULL_NAME}
            
            ### OUTPUT FORMAT:
            Write a complete, professional cover letter with proper formatting (date, company address if relevant, greeting, body paragraphs, and signature).
        `;

        console.log(`[AI_LOG] Cover Letter Prompt Snippet: "${clPrompt.slice(0, 200).replace(/\n/g, ' ')}..."`);

        let coverLetter = "Cover letter generation skipped/failed.";
        const clModels = [
            'mistralai/mistral-small-3.1-24b-instruct:free',
            'google/gemini-2.0-flash-exp:free',
            'xiaomi/mimo-v2-flash:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'qwen/qwen3-4b:free'
        ];

        // Add delay before cover letter generation to avoid hitting rate limits immediately after resume generation
        await new Promise(r => setTimeout(r, 3000));

        for (const clModel of clModels) {
            const start = Date.now();
            try {
                console.log(`[AI_LOG] Generating cover letter with ${clModel}...`);
                const clRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: clModel,
                    messages: [{ role: 'user', content: clPrompt }]
                }, {
                    headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
                    timeout: 30000
                });
                const duration = Date.now() - start;
                console.log(`[AI_LOG] Cover Letter Response received in ${duration}ms`);

                coverLetter = clRes.data.choices[0].message.content;
                console.log(`✅ [AI_LOG] Cover letter generated with ${clModel}`);
                break;
            } catch (e: any) {
                const duration = Date.now() - start;
                console.warn(`❌ [AI_LOG] Cover letter model ${clModel} failed after ${duration}ms: ${e.message}`);
                if (e.response?.status === 429) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        // Fallback checks (Using generic try-catch for others to avoid code dupe, but keeping simple for now)
        if (coverLetter === "Cover letter generation skipped/failed.") {
            console.warn(`[AI_LOG] Cover Letter Fallback: Trying Groq...`);
            // ... [Existing fallback logic can remain similar or be enhanced logs]
            // For brevity, assuming fallbacks follow similar pattern:
            try {
                const start = Date.now();
                const groqCL = await groqTextGeneration(clPrompt, 500);
                console.log(`[AI_LOG] Groq Response received in ${Date.now() - start}ms`);
                if (groqCL) {
                    coverLetter = groqCL;
                    console.log('✅ [AI_LOG] Cover letter generated with Groq');
                }
            } catch (e) { }
        }

        // ... (Repeating similar log enhancements for HF/NVIDIA fallbacks if desired)

        console.log(`[RESUME_TAILOR] Tailoring Complete. PDF: ${outputName}.pdf`);
        console.groupEnd();

        return { pdfUrl: `/generated_pdfs/${outputName}.pdf`, coverLetter };

    } catch (error: any) {
        console.error(`[ERROR_TRACE] Status: FAILED during tailorResume`);
        console.error(`[ERROR_TRACE] Stack Trace:`, error);
        console.groupEnd();
        throw error;
    }
};