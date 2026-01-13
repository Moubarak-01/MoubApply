import axios from 'axios';

// Top NVIDIA models (prioritized by capability)
const NVIDIA_MODELS = [
    'deepseek-r1',
    'llama-3.1-405b-instruct',
    'deepseek-v3.2',
    'qwen3-235b-a22b',
    'llama-3.3-70b-instruct',
    'mistral-large-3-675b-instruct-2512',
    'qwen3-coder-480b-a35b-instruct',
    'llama-3.1-nemotron-ultra-253b-v1',
    'deepseek-v3.1',
    'kimi-k2-thinking',
    'kimi-k2-instruct',
    'qwq-32b',
    'deepseek-r1-0528',
    'gemma-3-27b-it',
    'mistral-medium-3-instruct',
    'llama-3.3-nemotron-super-49b-v1.5',
    'phi-4-mini-flash-reasoning',
    'qwen3-next-80b-a3b-instruct',
    'devstral-2-123b-instruct-2512',
    'mistral-small-3.1-24b-instruct-2503',
    'llama-3.1-70b-instruct',
    'mixtral-8x22b-instruct-v0.1',
    'qwen2.5-coder-32b-instruct',
    'deepseek-r1-distill-qwen-32b',
    'gemma-2-27b-it',
    'llama-4-maverick-17b-128e-instruct',
    'phi-4-multimodal-instruct',
    'nemotron-3-nano-30b-a3b',
    'llama-3.2-90b-vision-instruct',
    'stockmark-2-100b-instruct',
    'ministral-14b-instruct-2512',
    'granite-3.3-8b-instruct',
    'llama-3.1-8b-instruct',
    'gemma-2-9b-it',
    'mistral-7b-instruct-v0.3',
    'phi-3-medium-128k-instruct',
    'qwen2.5-7b-instruct',
    'llama-3.2-3b-instruct'
];

/**
 * Call NVIDIA NIM API for text generation
 */
export const nvidiaTextGeneration = async (prompt: string, maxTokens: number = 500): Promise<string | null> => {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
        console.warn('[NVIDIA] API key not configured');
        return null;
    }

    for (const model of NVIDIA_MODELS) {
        try {
            console.log(`[NVIDIA] Trying model: ${model}...`);

            const response = await axios.post(
                `https://integrate.api.nvidia.com/v1/chat/completions`,
                {
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: maxTokens,
                    temperature: 0.7
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );

            const content = response.data.choices?.[0]?.message?.content;
            if (content) {
                console.log(`[NVIDIA] Success with ${model}`);
                return content;
            }
        } catch (err: any) {
            console.warn(`[NVIDIA] Model ${model} failed: ${err.message}`);
            if (err.response?.status === 429) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }

    console.log('[NVIDIA] All models exhausted');
    return null;
};

/**
 * Parse resume using NVIDIA NIM API
 */
export const parseResumeWithNVIDIA = async (resumeText: string): Promise<any> => {
    const prompt = `You are a resume parsing engine. Parse this resume into JSON with these exact fields:
{
  "personalInfo": { "fullName": "", "phone": "", "email": "", "linkedin": "", "github": "" },
  "education": [{ "institution": "", "degree": "", "dates": "", "gpa": "" }],
  "experience": [{ "company": "", "role": "", "dates": "", "points": [] }],
  "projects": [{ "title": "", "technologies": "", "points": [] }],
  "skills": { "languages": "", "frontend": "", "backend": "", "tools": "" }
}

Resume text:
"${resumeText.slice(0, 4000)}"

Return ONLY the JSON. No explanation.`;

    const result = await nvidiaTextGeneration(prompt, 1500);
    if (!result) return null;

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.log('[NVIDIA] JSON parse failed');
    }
    return null;
};

/**
 * Generate cover letter using NVIDIA
 */
export const generateCoverLetterWithNVIDIA = async (
    candidateName: string,
    skills: string,
    jobTitle: string,
    company: string,
    jobDescription: string
): Promise<string | null> => {
    const prompt = `Write a professional cover letter for ${candidateName} applying to ${jobTitle} at ${company}.

Skills: ${skills}
Job snippet: ${jobDescription.slice(0, 600)}

Requirements:
1. Concise (under 250 words)
2. NO placeholders like [Date] or [Skill] - use actual data
3. Sign with ${candidateName}`;

    return await nvidiaTextGeneration(prompt, 400);
};

/**
 * Tailor resume content using NVIDIA
 */
export const tailorResumeWithNVIDIA = async (
    resumeData: any,
    jobDescription: string
): Promise<any> => {
    const prompt = `You are a resume tailoring expert. Given this resume data and job description, optimize the resume content.

Current Resume Data:
${JSON.stringify(resumeData, null, 2)}

Job Description:
"${jobDescription.slice(0, 1500)}"

Return the same JSON structure but with:
1. Rewritten bullet points that highlight relevant skills
2. Prioritized experience/projects matching the job
3. Skills section emphasizing job requirements

Return ONLY valid JSON with the same structure.`;

    const result = await nvidiaTextGeneration(prompt, 2000);
    if (!result) return null;

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.log('[NVIDIA] Tailoring JSON parse failed');
    }
    return null;
};
