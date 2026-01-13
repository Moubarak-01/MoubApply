import axios from 'axios';

// Groq models (known for speed)
const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'llama3-70b-8192',
    'llama3-8b-8192',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
    'gemma-7b-it'
];

/**
 * Call Groq API for text generation (very fast!)
 */
export const groqTextGeneration = async (prompt: string, maxTokens: number = 500): Promise<string | null> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.warn('[GROQ] API key not configured');
        return null;
    }

    for (const model of GROQ_MODELS) {
        try {
            console.log(`[GROQ] Trying model: ${model}...`);

            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
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
                    timeout: 30000
                }
            );

            const content = response.data.choices?.[0]?.message?.content;
            if (content) {
                console.log(`[GROQ] Success with ${model}`);
                return content;
            }
        } catch (err: any) {
            console.warn(`[GROQ] Model ${model} failed: ${err.message}`);
            if (err.response?.status === 429) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    console.log('[GROQ] All models exhausted');
    return null;
};

/**
 * Parse resume using Groq (fast fallback)
 */
export const parseResumeWithGroq = async (resumeText: string): Promise<any> => {
    const prompt = `Parse this resume into JSON:
{
  "personalInfo": { "fullName": "", "phone": "", "email": "", "linkedin": "", "github": "" },
  "education": [{ "institution": "", "degree": "", "dates": "", "gpa": "" }],
  "experience": [{ "company": "", "role": "", "dates": "", "points": [] }],
  "projects": [{ "title": "", "technologies": "", "points": [] }],
  "skills": { "languages": "", "frontend": "", "backend": "", "tools": "" }
}

Resume:
"${resumeText.slice(0, 3500)}"

Return ONLY JSON.`;

    const result = await groqTextGeneration(prompt, 1200);
    if (!result) return null;

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { }
    return null;
};
