import axios from 'axios';
import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';
import { groqTextGeneration } from './groqService';

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

    for (const model of MODELS) {
        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1 // Low temp for determinism
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

            let answer = response.data.choices[0].message.content.trim();

            // Cleanup
            answer = answer.replace(/^["']|["']$/g, '');

            // Validation for Options
            if (options) {
                // Try exact match
                if (options.includes(answer)) return answer;

                // Try fuzzy match
                const lowerAnswer = answer.toLowerCase();
                const bestMatch = options.find(o => o.toLowerCase() === lowerAnswer || o.toLowerCase().includes(lowerAnswer));
                if (bestMatch) return bestMatch;

                // Fallback: If AI returns something insane, log it and continue loop
                console.warn(`[AI_QA] AI returned "${answer}" which is not in options: ${options}`);
                throw new Error('Invalid option selected');
            }

            return answer;

        } catch (err: any) {
            console.warn(`⚠️ [AI_QA] Model ${model} failed: ${err.message}`);
        }
    }

    // Fallback to Groq if OpenRouter fails
    try {
        console.log('[AI_QA] Falling back to Groq...');
        const groqAns = await groqTextGeneration(prompt, 100);
        if (!groqAns) throw new Error('Groq returned null');
        let cleanGroq = groqAns.trim().replace(/^["']|["']$/g, '');
        if (options) {
            const bestMatch = options.find(o => o.toLowerCase() === cleanGroq.toLowerCase());
            return bestMatch || options[0]; // Safe default
        }
        return cleanGroq;
    } catch (e) {
        console.error('[AI_QA] All AI providers failed.');
        return options ? options[0] : ''; // Ultimate fallback
    }
};
