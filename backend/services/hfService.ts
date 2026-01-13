import { HfInference } from '@huggingface/inference';

// Initialize with token from .env
const hf = new HfInference(process.env.HF_TOKEN);

// List of Hugging Face models to try (free inference API)
const HF_MODELS = [
    'mistralai/Mistral-7B-Instruct-v0.3',
    'meta-llama/Llama-3.2-3B-Instruct',
    'google/gemma-2-9b-it',
    'Qwen/Qwen2.5-7B-Instruct',
    'microsoft/Phi-3-mini-4k-instruct'
];

/**
 * Generic text generation using Hugging Face Inference API
 * Falls back through multiple models if rate limited
 */
export const hfTextGeneration = async (prompt: string, maxTokens: number = 500): Promise<string | null> => {
    for (const model of HF_MODELS) {
        try {
            console.log(`[HF] Trying model: ${model}...`);
            const result = await hf.textGeneration({
                model,
                inputs: prompt,
                parameters: {
                    max_new_tokens: maxTokens,
                    temperature: 0.7,
                    return_full_text: false
                }
            });
            console.log(`[HF] Success with ${model}`);
            return result.generated_text;
        } catch (err: any) {
            console.warn(`[HF] Model ${model} failed: ${err.message}`);
            if (err.message?.includes('rate limit')) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
    console.log('[HF] All models exhausted');
    return null;
};

/**
 * Parse resume text using Hugging Face (fallback for OpenRouter)
 */
export const parseResumeWithHF = async (resumeText: string): Promise<any> => {
    const prompt = `You are a resume parsing engine. Parse this resume into JSON with these fields:
personalInfo (fullName, phone, email, linkedin, github),
education (array with institution, degree, dates, gpa),
experience (array with company, role, dates, points array),
projects (array with title, technologies, points array),
skills (languages, frontend, backend, tools)

Resume:
"${resumeText.slice(0, 3000)}"

Return ONLY valid JSON, no explanation.`;

    const result = await hfTextGeneration(prompt, 1000);
    if (!result) return null;

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.log('[HF] JSON parse failed');
    }
    return null;
};

/**
 * Generate cover letter using Hugging Face (fallback)
 */
export const generateCoverLetterWithHF = async (
    candidateName: string,
    skills: string,
    jobTitle: string,
    company: string,
    jobDescription: string
): Promise<string | null> => {
    const prompt = `Write a professional cover letter for ${candidateName} applying to ${jobTitle} at ${company}.

Skills: ${skills}
Job Description: ${jobDescription.slice(0, 500)}

Write a concise, personalized cover letter (under 250 words). Do NOT use placeholders like [Date] or [Skill]. Sign with ${candidateName}.`;

    return await hfTextGeneration(prompt, 400);
};
