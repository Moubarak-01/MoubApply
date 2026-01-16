import axios from 'axios';
import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';
import { groqTextGeneration } from './groqService';
import { hfTextGeneration } from './hfService';
import { nvidiaTextGeneration } from './nvidiaService';

interface UserContext {
    resumeText: string;
    personalDetails: any;
    education: any;
    experience: any[];
    skills: string[];
    applicationDefaults: any;
}

export const matchOptionWithAI = async (question: string, options: string[], context: UserContext): Promise<string | null> => {
    const prompt = `
    You are an AI assistant helping a candidate fill out a job application.
    
    QUESTION: "${question}"
    AVAILABLE OPTIONS: ${JSON.stringify(options)}
    
    CANDIDATE CONTEXT:
    - Resume: ${context.resumeText.slice(0, 3000)}...
    - Education: ${JSON.stringify(context.education)}
    - Defaults: ${JSON.stringify(context.applicationDefaults)}
    
    INSTRUCTIONS:
    - Select the EXACT option from the list that best matches the candidate's profile.
    - If "Yes" or "No", use the profile data to decide truthy/falsy.
    - If asking about years of experience, calculate from the resume.
    - Return ONLY the exact string from the options list. No quotes, no explanations.
    - If uncertain, choose the most likely positive/neutral option or the last options if "Decline" is present.
  `;

    return await runAI(prompt, options);
};

export const answerFreeTextWithAI = async (question: string, context: UserContext, charLimit: number = 200): Promise<string> => {
    const prompt = `
    You are an AI assistant answering a job application question for a candidate.
    
    QUESTION: "${question}"
    CHARACTER LIMIT: ${charLimit}
    
    CANDIDATE CONTEXT:
    - Resume: ${context.resumeText.slice(0, 3000)}...
    - Education: ${JSON.stringify(context.education)}
    - Experience: ${JSON.stringify(context.experience)}
    
    INSTRUCTIONS:
    - Write a concise, professional answer based strictly on the candidate's data.
    - First person ("I have...").
    - Do NOT hallucinate. If the answer isn't in the context, say "I have extensive experience in this area and am eager to discuss more."
    - Keep it under ${charLimit} characters.
    - Return ONLY the answer text.
  `;

    return await runAI(prompt);
};

const runAI = async (prompt: string, options?: string[]): Promise<string> => {
    const MODELS = [
        'xiaomi/mimo-v2-flash:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'mistralai/mistral-small-3.1-24b-instruct:free',
        'meta-llama/llama-3.1-8b-instruct:free',
        'huggingfaceh4/zephyr-7b-beta:free',
        'openchat/openchat-7b:free',
        'gryphe/mythomax-l2-13b:free',
        'undi95/toppy-m-7b:free',
        'liquid/lfm-40b:free'
    ];

    // Helper to validate and return matches
    const processAnswer = (ans: string): string | null => {
        let clean = ans.trim().replace(/^["']|["']$/g, '');
        if (options) {
            if (options.includes(clean)) return clean;
            const lower = clean.toLowerCase();
            const best = options.find(o => o.toLowerCase() === lower || o.toLowerCase().includes(lower));
            if (best) return best;
            return null; // Invalid option
        }
        return clean;
    };

    // 1. OpenRouter Waterfall
    for (const model of MODELS) {
        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://moubapply.com',
                        'X-Title': 'MoubApply'
                    },
                    timeout: 10000
                }
            );

            const raw = response.data.choices[0].message.content;
            const result = processAnswer(raw);
            if (result) return result;

            console.warn(`[AI_QA] Model ${model} returned invalid option: ${raw}`);

        } catch (err: any) {
            console.warn(`⚠️ [AI_QA] Model ${model} failed: ${err.message}`);
        }
    }

    // 2. Fallback: Hugging Face
    try {
        console.log('[AI_QA] Falling back to Hugging Face...');
        const hfAns = await hfTextGeneration(prompt, 200);
        if (hfAns) {
            const result = processAnswer(hfAns);
            if (result) return result;
        }
    } catch (e) { console.warn('[AI_QA] HF failed'); }

    // 3. Fallback: NVIDIA
    try {
        console.log('[AI_QA] Falling back to NVIDIA...');
        const nvAns = await nvidiaTextGeneration(prompt, 200);
        if (nvAns) {
            const result = processAnswer(nvAns);
            if (result) return result;
        }
    } catch (e) { console.warn('[AI_QA] NVIDIA failed'); }

    // 4. Fallback: Groq
    try {
        console.log('[AI_QA] Falling back to Groq...');
        const groqAns = await groqTextGeneration(prompt, 100);
        if (groqAns) {
            const result = processAnswer(groqAns);
            if (result) return result;
        }
    } catch (e) { console.warn('[AI_QA] Groq failed'); }

    console.error('[AI_QA] All AI providers failed.');
    return options ? options[0] : '';
};
