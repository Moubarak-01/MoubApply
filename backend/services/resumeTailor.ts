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
    try {
        const job = await Job.findById(jobId);
        const user = await User.findById(userId);

        if (!job || !user || !user.structuredExperience) {
            throw new Error('Missing data or resume not yet structured.');
        }

        console.log(`🪄 AI Tailoring Custom Resume for: ${job.title}...`);

        // Extract user data explicitly
        const userData = user.structuredExperience;
        const personalInfo = userData.personalInfo || {};

        const prompt = `
      You are an expert resume tailor. Your job is to adapt the user's real experience to match a specific job.

      ⚠️ CRITICAL RULES - FOLLOW EXACTLY:
      1. NEVER invent information. Use ONLY the data provided below.
      2. PRESERVE all personal info EXACTLY: name, email, phone, LinkedIn, GitHub.
      3. PRESERVE all company names, project names, project LINKS, and dates EXACTLY.
      4. PRESERVE all project URLs - these are CLICKABLE LINKS, do not remove them.
      5. ONLY rewrite bullet points to better match the job keywords.
      6. Add job-relevant keywords from the job description into bullet points.
      7. DO NOT escape any characters. Return raw strings. The code will handle escaping.
      8. Return ONLY valid JSON. No markdown, no explanation.

      ### USER'S ACTUAL DATA (DO NOT CHANGE THESE):
      - Full Name: ${personalInfo.fullName || 'Unknown'}
      - Email: ${personalInfo.email || 'Unknown'}
      - Phone: ${personalInfo.phone || 'Unknown'}
      - LinkedIn: ${personalInfo.linkedin || 'Unknown'}
      - GitHub: ${personalInfo.github || 'Unknown'}

      ### COMPLETE USER PROFILE (PRESERVE ALL LINKS):
      ${JSON.stringify(userData, null, 2)}

      ### JOB DESCRIPTION TO MATCH:
      "${job.rawDescription?.slice(0, 2000) || 'No description available'}"

      ### OUTPUT JSON STRUCTURE (fill with user's REAL data, tailor bullets):
      {
        "FULL_NAME": "${personalInfo.fullName || 'Full Name'}",
        "PHONE": "${personalInfo.phone || 'Phone'}",
        "EMAIL": "${personalInfo.email || 'Email'}",
        "LINKEDIN_ID": "extract username from linkedin URL (e.g., moubarak-ali-kparah)",
        "GITHUB_ID": "extract username from github URL (e.g., Moubarak-01)",
        "UNIVERSITY": "From education section",
        "GRAD_DATE": "Dec 2028 (no 'Expected Expected')",
        "DEGREE": "From education section",
        "GPA": "From education section",
        "LOCATION": "From education section",
        "COURSEWORK": "From education section",
        "EXPERIENCE": [
            {
                "COMPANY": "Actual company name",
                "DATES": "Actual dates",
                "ROLE": "Actual role",
                "LOCATION": "Actual location",
                "BULLETS": ["Rewritten bullet matching job keywords...", "Keep metrics like 20+ and 15%"]
            }
        ],
        "PROJECTS": [
            {
                "TITLE": "EXACT project name from user data",
                "LINK": "EXACT URL from user data (e.g., https://github.com/Moubarak-01/Moubely)",
                "TECH_STACK": "Technologies from user data",
                "DATE": "Date from user data",
                "BULLETS": ["Rewritten to highlight job-relevant skills..."]
            }
        ],
        "LEADERSHIP": [
            {
               "ORG_NAME": "Actual organization",
               "ROLE": "Actual role",
               "DATES": "Actual dates",
               "BULLETS": ["Tailored leadership bullet..."]
            }
        ],
        "SKILLS_LANGUAGES": "From skills section",
        "SKILLS_FRONTEND": "From skills section",
        "SKILLS_BACKEND": "From skills section",
        "SKILLS_AI": "From skills section",
        "SKILLS_TOOLS": "From skills section",
        "AFFILIATIONS": "From honors section"
      }
    `;

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

        let data: any = null;
        let lastError: any = null;

        for (const model of MODELS) {
            try {
                console.log(`Trying model: ${model}`);
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    { model, messages: [{ role: 'user', content: prompt }] },
                    {
                        headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://moubapply.com', 'X-Title': 'MoubApply' },
                        timeout: 40000
                    }
                );

                const content = response.data.choices[0].message.content;
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error("No JSON found");

                try {
                    data = JSON.parse(jsonMatch[0].replace(/(?<!\\)\\(?![\\/bfnrtu"])/g, '\\\\'));
                } catch {
                    console.log("JSON Parse failed, attempting simpler fix...");
                    data = JSON.parse(jsonMatch[0]);
                }

                // SANITIZE DATA FOR LATEX HERE
                if (data) {
                    data = sanitizeDataForLatex(data);
                    break;
                }
            } catch (err: any) {
                lastError = err;
                console.warn(`Model ${model} failed: ${err.message}`);
                // Exponential backoff for rate limits
                if (err.response?.status === 429) {
                    const delay = 5000 * (MODELS.indexOf(model) + 1);
                    console.log(`Rate limited. Waiting ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        // Fallback to Hugging Face if OpenRouter failed
        if (!data) {
            console.log('[Fallback] Trying Hugging Face for tailoring...');
            const hfResult = await hfTextGeneration(prompt, 1500);
            if (hfResult) {
                try {
                    const jsonMatch = hfResult.match(/\{[\s\S]*\}/);
                    if (jsonMatch) data = JSON.parse(jsonMatch[0]);
                } catch (e) { }
            }
        }

        // Fallback to NVIDIA if HF also failed
        if (!data) {
            console.log('[Fallback] Trying NVIDIA for tailoring...');
            const nvidiaResult = await nvidiaTextGeneration(prompt, 1500);
            if (nvidiaResult) {
                try {
                    const jsonMatch = nvidiaResult.match(/\{[\s\S]*\}/);
                    if (jsonMatch) data = JSON.parse(jsonMatch[0]);
                } catch (e) { }
            }
        }

        // Fallback to Groq (very fast)
        if (!data) {
            console.log('[Fallback] Trying Groq for tailoring...');
            const groqResult = await groqTextGeneration(prompt, 1500);
            if (groqResult) {
                try {
                    const jsonMatch = groqResult.match(/\{[\s\S]*\}/);
                    if (jsonMatch) data = JSON.parse(jsonMatch[0]);
                } catch (e) { }
            }
        }

        if (!data) throw new Error("AI Tailoring failed on all providers (OpenRouter, HF, NVIDIA, Groq).");

        // Force sanitization in case fallback was used that bypassed previous check
        data = sanitizeDataForLatex(data);

        // Mustache-like manual replacement helper
        const renderList = (templateSegment: string, list: any[], itemName: string) => {
            return list.map(item => {
                let seg = templateSegment;
                Object.keys(item).forEach(key => {
                    if (key === 'BULLETS') {
                        const bulletStr = item[key].map((b: string) => `\\resumeItem{ ${b} }`).join('\n');
                        seg = seg.replace(new RegExp(`{{#BULLETS}}[\\s\\S]*?{{/BULLETS}}`, 'g'), bulletStr);
                    } else {
                        seg = seg.replace(new RegExp(`{{${key}}}`, 'g'), item[key]);
                    }
                });
                return seg;
            }).join('\n');
        };

        // Extract block templates from the main string (Simplification: We instruct AI to match keys, but for nested arrays we need logic)
        // Actually, simple replace for scalars, and custom logic for arrays.

        let finalTex = CUSTOM_TEMPLATE;

        // Scalars
        const scalars = ['FULL_NAME', 'PHONE', 'EMAIL', 'LINKEDIN_ID', 'GITHUB_ID', 'UNIVERSITY', 'GRAD_DATE', 'DEGREE', 'GPA', 'LOCATION', 'COURSEWORK',
            'SKILLS_LANGUAGES', 'SKILLS_FRONTEND', 'SKILLS_BACKEND', 'SKILLS_AI', 'SKILLS_TOOLS', 'AFFILIATIONS'];

        scalars.forEach(key => {
            finalTex = finalTex.replace(new RegExp(`{{${key}}}`, 'g'), data[key] || '');
        });

        // Lists - Experience
        const expRegex = /{{#EXPERIENCE}}([\s\S]*?){{\/EXPERIENCE}}/g;
        const expMatch = expRegex.exec(CUSTOM_TEMPLATE);
        if (expMatch && data.EXPERIENCE) {
            const block = expMatch[1];
            const result = renderList(block, data.EXPERIENCE, 'EXPERIENCE');
            finalTex = finalTex.replace(expRegex, result);
        }

        // Projects
        const projRegex = /{{#PROJECTS}}([\s\S]*?){{\/PROJECTS}}/g;
        const projMatch = projRegex.exec(CUSTOM_TEMPLATE);
        if (projMatch && data.PROJECTS) {
            const block = projMatch[1];
            const result = renderList(block, data.PROJECTS, 'PROJECTS');
            finalTex = finalTex.replace(projRegex, result);
        }

        // Leadership
        const leadRegex = /{{#LEADERSHIP}}([\s\S]*?){{\/LEADERSHIP}}/g;
        const leadMatch = leadRegex.exec(CUSTOM_TEMPLATE);
        if (leadMatch && data.LEADERSHIP) {
            const block = leadMatch[1];
            const result = renderList(block, data.LEADERSHIP, 'LEADERSHIP');
            finalTex = finalTex.replace(leadRegex, result);
        }

        // Compile
        const outputName = `tailored_${job.company.replace(/\s+/g, '_')}_${Date.now()}`;
        await compileLatex(finalTex, outputName);

        // Generate Cover Letter (Separate Call)
        const clPrompt = `
            You are an expert career coach writing a cover letter.
            
            CANDIDATE: ${data.FULL_NAME}
            JOB TITLE: ${job.title}
            COMPANY: ${job.company}
            
            JOB DESCRIPTION SHORT:
            "${job.rawDescription.slice(0, 1000)}..."
            
            CANDIDATE DATA:
            - SKILLS: ${data.SKILLS_LANGUAGES}, ${data.SKILLS_FRONTEND}, ${data.SKILLS_BACKEND}
            - TOP ACHIEVEMENT: "${data.EXPERIENCE?.[0]?.BULLETS?.[0] || 'Strong software engineering optimization'}"
            - LOCATION: ${data.LOCATION}
            - PHONE: ${data.PHONE}
            - EMAIL: ${data.EMAIL}
            
            INSTRUCTIONS:
            1. Write a professional cover letter.
            2. **STRICTLY PROHIBITED**: Do NOT use placeholders like "[Date]", "[City]", "[Relevant Experience]", or "[Skill]". 
            3. **MANDATORY**: You MUST fill in all brackets with the actual candidate data provided above.
               - Instead of saying "my background in [Skill]", say "my background in ${data.SKILLS_LANGUAGES?.split(',')[0]}".
               - Instead of "[Previous Company]", use "${data.EXPERIENCE?.[0]?.COMPANY || 'my previous role'}".
            4. Keep it concise (under 300 words).
            5. Sign it with: ${data.FULL_NAME}.
        `;

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
            try {
                console.log(`📝 Generating cover letter with ${clModel}...`);
                const clRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: clModel,
                    messages: [{ role: 'user', content: clPrompt }]
                }, {
                    headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
                    timeout: 30000
                });
                coverLetter = clRes.data.choices[0].message.content;
                console.log(`✅ Cover letter generated with ${clModel}`);
                break;
            } catch (e: any) {
                console.warn(`❌ Cover letter model ${clModel} failed: ${e.message}`);
                if (e.response?.status === 429) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        // Fallback to Groq if OpenRouter fails
        if (coverLetter === "Cover letter generation skipped/failed.") {
            try {
                console.log('📝 Trying Groq for cover letter...');
                const groqCL = await groqTextGeneration(clPrompt, 500);
                if (groqCL) {
                    coverLetter = groqCL;
                    console.log('✅ Cover letter generated with Groq');
                }
            } catch (e) { }
        }

        // Fallback to HuggingFace if Groq fails
        if (coverLetter === "Cover letter generation skipped/failed.") {
            try {
                console.log('📝 Trying HuggingFace for cover letter...');
                const hfCL = await hfTextGeneration(clPrompt, 500);
                if (hfCL) {
                    coverLetter = hfCL;
                    console.log('✅ Cover letter generated with HuggingFace');
                }
            } catch (e) { }
        }

        // Fallback to NVIDIA if HuggingFace fails
        if (coverLetter === "Cover letter generation skipped/failed.") {
            try {
                console.log('📝 Trying NVIDIA for cover letter...');
                const nvCL = await nvidiaTextGeneration(clPrompt, 500);
                if (nvCL) {
                    coverLetter = nvCL;
                    console.log('✅ Cover letter generated with NVIDIA');
                }
            } catch (e) { }
        }

        return { pdfUrl: `/generated_pdfs/${outputName}.pdf`, coverLetter };

    } catch (error) {
        console.error('Custom Tailoring Error:', error);
        throw error;
    }
};