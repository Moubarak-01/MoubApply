import axios from 'axios';
import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';
import { hfTextGeneration } from './hfService';
import { nvidiaTextGeneration } from './nvidiaService';
import { groqTextGeneration } from './groqService';

export const enrichJobWithAI = async (jobId: string, userId: string) => {
  try {
    console.group('[AI_MATCHER] Starting Enrichment Process');

    // 1. Validate Inputs
    const job = await Job.findById(jobId);
    const user = await User.findById(userId);

    if (!job) {
      console.error(`[ERROR_TRACE] Status: FAILED during Job Lookup`);
      console.error(`[ERROR_TRACE] Input Context: Job ID ${jobId}`);
      throw new Error('Job not found');
    }
    if (!user) {
      console.error(`[ERROR_TRACE] Status: FAILED during User Lookup`);
      console.error(`[ERROR_TRACE] Input Context: User ID ${userId}`);
      throw new Error('User not found');
    }

    // 2. Log Content Tracking
    console.log(`[AI_LOG] Processing Resume for: ${user.name || 'Candidate'} (ID: ${userId})`);
    console.log(`[AI_LOG] Job Description: "${job.title}" at "${job.company}"`);
    console.log(`[AI_LOG] Resume Length: ${user.masterResumeText?.length || 0} chars`);

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not defined');
    }

    // Extract user's graduation info for comparison
    const userGradYear = (user.personalDetails as any)?.gradYear || (user.structuredExperience as any)?.education?.[0]?.dates || 'Unknown';

    const prompt = `
      Analyze the provided Job Description and Candidate Resume. Generate a match analysis based on the following strict logic:

      ### RESUME (CANDIDATE DATA):
      "${user.masterResumeText}"
      
      Expected Graduation Year from Resume: ${userGradYear}
      
      ### JOB DESCRIPTION:
      "${job.rawDescription}"
      Job Title: ${job.title}
      Company: ${job.company}
      
      ### ANALYSIS RULES (FOLLOW STRICTLY):
      
      1. **ELIGIBILITY CHECK (CRITICAL)**:
         - Compare the "Expected Graduation" or "Years of Experience" required in the JD against the specific dates on the resume.
         - If there is ANY mismatch (e.g., JD requires 2026 grad but resume shows 2028), you MUST:
           a) List it in "theCatch"
           b) You are STRICTLY FORBIDDEN from claiming "perfect match" in whyYouWillLoveIt
           c) REDUCE matchScore by at least 20 points
      
      2. **TECHNICAL ALIGNMENT**:
         - Identify 3 specific technical projects or skills on the resume that solve problems mentioned in the JD responsibilities
         - Each claim MUST reference a specific project name or skill from the resume
      
      3. **FACT-CHECKING**:
         - Every claim in "whyYouWillLoveIt" MUST be supported by a direct data point from the resume
         - Do NOT use generic praise if a hard requirement (like graduation date) is not met
         - Never hallucinate skills or projects not explicitly in the resume
      
      4. **WEIGHTED SCORING**:
         - Start at 100 if perfect match
         - Subtract 30 if graduation/experience requirement mismatch
         - Subtract 10 for each missing core technical skill
      
      ### OUTPUT FORMAT (JSON ONLY):
      {
        "matchScore": <number 0-100, reflecting BOTH technical AND eligibility>,
        "whyYouWillLoveIt": "<specific reasons with resume evidence, NO generic praise if eligibility issue exists>",
        "theCatch": "<realistic warnings, MUST include any date/eligibility mismatches>",
        "topSkills": ["<skill1 from resume that matches JD>", "<skill2>", "<skill3>"]
      }
      
      Return ONLY the JSON, no markdown or explanation.
    `;

    console.log(`[AI_LOG] Prompt Snippet: "${prompt.slice(0, 200).replace(/\n/g, ' ')}..."`);

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

    let aiData: any = null;
    let lastError: any = null;

    for (const model of MODELS) {
      const start = Date.now();
      try {
        console.log(`[AI_LOG] Invoking Model: OpenRouter - ${model}`);
        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          { model, messages: [{ role: 'user', content: prompt }] },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://moubapply.com',
              'X-Title': 'MoubApply'
            },
            timeout: 30000
          }
        );

        const duration = Date.now() - start;
        console.log(`[AI_LOG] Response received in ${duration}ms`);

        const content = response.data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response");

        aiData = JSON.parse(jsonMatch[0].replace(/(?<!\\)\\(?![\\/bfnrtu"])/g, '\\'));
        if (aiData) {
          console.log(`✅ [AI_LOG] Match success with ${model}`);
          break;
        }
      } catch (err: any) {
        const duration = Date.now() - start;
        lastError = err;
        console.warn(`⚠️ [AI_LOG] Model ${model} failed after ${duration}ms: ${err.message}`);

        if (err.response?.status === 429) {
          console.log("[AI_LOG] Rate limited (429), waiting 5s before fallback...");
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    // Fallback Logging Wrapper
    const tryFallback = async (providerName: string, serviceFn: any) => {
      if (aiData) return;
      console.warn(`[AI_LOG] Rotation Logic: OpenRouter failed, retrying with ${providerName}...`);
      const start = Date.now();
      const result = await serviceFn(prompt, 500);
      const duration = Date.now() - start;
      console.log(`[AI_LOG] ${providerName} Response received in ${duration}ms`);

      if (result) {
        try {
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiData = JSON.parse(jsonMatch[0]);
            console.log(`✅ [AI_LOG] Match success with ${providerName}`);
          }
        } catch (e) {
          console.error(`[AI_LOG] Failed to parse JSON from ${providerName}`);
        }
      }
    };

    // Fallback Chain
    if (!aiData) await tryFallback('Hugging Face', hfTextGeneration);
    if (!aiData) await tryFallback('NVIDIA', nvidiaTextGeneration);
    if (!aiData) await tryFallback('Groq', groqTextGeneration);

    if (!aiData) {
      console.error(`[ERROR_TRACE] Status: FAILED during AI Text Generation`);
      console.error(`[ERROR_TRACE] Stack Trace: ${lastError?.stack || lastError}`);
      throw new Error(`AI matching failed on all providers. Last error: ${lastError?.message}`);
    }

    // Update Job Document
    job.matchScore = aiData.matchScore || 0;
    job.aiSummary = {
      whyYouWillLoveIt: aiData.whyYouWillLoveIt || '',
      theCatch: aiData.theCatch || '',
      topSkills: aiData.topSkills || []
    };

    await job.save();
    console.table && console.table(aiData);
    console.log(`[AI_MATCHER] Job Enriched Successfully: ${job.matchScore}% Match`);
    console.groupEnd();
    return job;

  } catch (error: any) {
    console.error(`[ERROR_TRACE] Status: FAILED during enrichJobWithAI`);
    console.error(`[ERROR_TRACE] Stack Trace:`, error);
    console.groupEnd();
    throw error;
  }
};

/**
 * Generates a tailored "Why do you want to join?" essay for a specific job.
 * Uses the user's resume and job description to create a personalized response.
 */
export const generateEssay = async (jobId: string, userId: string): Promise<string> => {
  console.log(`[AI_GEN] Generating "Why Us" essay for Job ${jobId}, User ${userId}`);

  const job = await Job.findById(jobId);
  const user = await User.findById(userId);

  if (!job || !user) {
    console.error(`[AI_GEN] Job or User not found`);
    return "I am excited to contribute my skills to your team."; // Fallback
  }

  const prompt = `
    You are a career advisor helping a job applicant write a compelling "Why do you want to join our company?" response.

    CANDIDATE RESUME:
    ${user.masterResumeText || "No resume provided."}

    JOB DETAILS:
    Company: ${job.company}
    Role: ${job.title}
    Description: ${job.rawDescription || ""}

    INSTRUCTIONS:
    - Write a 100-150 word essay explaining why this candidate is a great fit for this specific role.
    - Reference specific skills from the resume that match the job.
    - Sound enthusiastic but professional.
    - Do NOT use generic phrases like "I am a hard worker".
    - Return ONLY the essay text, no quotes or preamble.
  `;

  const MODELS = [
    'google/gemini-2.0-flash-exp:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free'
  ];

  for (const model of MODELS) {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { model, messages: [{ role: 'user', content: prompt }], max_tokens: 300 },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://moubapply.com',
            'X-Title': 'MoubApply'
          },
          timeout: 20000
        }
      );

      const essay = response.data.choices[0].message.content.trim();
      console.log(`✅ [AI_GEN] Essay generated with ${model}: "${essay.slice(0, 80)}..."`);
      return essay;
    } catch (err: any) {
      console.warn(`⚠️ [AI_GEN] Model ${model} failed: ${err.message}`);
    }
  }

  // Ultimate fallback
  console.error(`[AI_GEN] All models failed, using fallback essay.`);
  return `I am excited to apply for the ${job.title} position at ${job.company}. My background aligns well with your team's mission, and I am eager to contribute my skills to drive meaningful impact.`;
};