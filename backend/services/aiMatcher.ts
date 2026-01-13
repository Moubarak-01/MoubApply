import axios from 'axios';
import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';
import { hfTextGeneration } from './hfService';
import { nvidiaTextGeneration } from './nvidiaService';
import { groqTextGeneration } from './groqService';

export const enrichJobWithAI = async (jobId: string, userId: string) => {
  try {
    const job = await Job.findById(jobId);
    const user = await User.findById(userId);

    if (!job) {
      console.error(`❌ Job not found in AI Matcher: ${jobId}`);
      throw new Error('Job not found');
    }
    if (!user) {
      console.error(`❌ User not found in AI Matcher: ${userId}`);
      throw new Error('User not found');
    }

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not defined');
    }

    const prompt = `
      Compare the specific tech stack and projects in the provided Resume with the Job Description. 
      Calculate a matchScore based on strict skill overlap.
      
      Resume: "${user.masterResumeText}"
      Job Description: "${job.rawDescription}"
      
      Provide a JSON response with: 
      matchScore (0-100), 
      whyYouWillLoveIt (high-detail), 
      theCatch (realistic warning), 
      and topSkills (top 3 critical tech).
      
      Return ONLY the JSON.
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

    let aiData: any = null;
    let lastError: any = null;

    for (const model of MODELS) {
      try {
        console.log(`Matching with model: ${model}...`);
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

        const content = response.data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");

        aiData = JSON.parse(jsonMatch[0].replace(/(?<!\\)\\(?![\\/bfnrtu"])/g, '\\'));
        if (aiData) {
          console.log(`✅ Match success with ${model}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} matching failed: ${err.message}`);
        if (err.response?.status === 429) {
          console.log("Rate limited (429), waiting 5s before fallback...");
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    // Fallback to Hugging Face
    if (!aiData) {
      console.log('[Fallback] Trying Hugging Face for matching...');
      const hfResult = await hfTextGeneration(prompt, 500);
      if (hfResult) {
        try {
          const jsonMatch = hfResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) aiData = JSON.parse(jsonMatch[0]);
        } catch (e) { }
      }
    }

    // Fallback to NVIDIA
    if (!aiData) {
      console.log('[Fallback] Trying NVIDIA for matching...');
      const nvidiaResult = await nvidiaTextGeneration(prompt, 500);
      if (nvidiaResult) {
        try {
          const jsonMatch = nvidiaResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) aiData = JSON.parse(jsonMatch[0]);
        } catch (e) { }
      }
    }

    // Fallback to Groq (very fast)
    if (!aiData) {
      console.log('[Fallback] Trying Groq for matching...');
      const groqResult = await groqTextGeneration(prompt, 500);
      if (groqResult) {
        try {
          const jsonMatch = groqResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) aiData = JSON.parse(jsonMatch[0]);
        } catch (e) { }
      }
    }

    if (!aiData) throw new Error(`AI matching failed on all providers (OpenRouter, HF, NVIDIA, Groq). Last error: ${lastError?.message}`);

    // Update Job Document
    job.matchScore = aiData.matchScore || 0;
    job.aiSummary = {
      whyYouWillLoveIt: aiData.whyYouWillLoveIt || '',
      theCatch: aiData.theCatch || '',
      topSkills: aiData.topSkills || []
    };

    await job.save();
    return job;

  } catch (error) {
    console.error('AI Matching Error:', error);
    throw error;
  }
};