import axios from 'axios';
import { parseResumeWithHF } from './hfService';
import { parseResumeWithNVIDIA } from './nvidiaService';
import { parseResumeWithGroq } from './groqService';

export const parseResumeToJSON = async (resumeText: string) => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not defined');
  }

  console.log('🤖 AI is parsing resume into structured JSON...');

  const prompt = `
    You are a resume parsing engine. I will provide a raw text extraction from a resume. 
    Your goal is to extract the details into a specific JSON structure.
    
    ### RAW RESUME TEXT:
    "${resumeText}"
    
    ### REQUIRED JSON STRUCTURE:
    {
      "personalInfo": {
        "fullName": "Full name",
        "phone": "Phone number",
        "email": "Email address",
        "linkedin": "LinkedIn URL",
        "github": "GitHub URL"
      },
      "education": [
        {
          "institution": "University Name",
          "location": "City, State",
          "degree": "Degree and Major",
          "dates": "Date range",
          "gpa": "GPA value",
          "coursework": "Key courses"
        }
      ],
      "experience": [
        {
          "company": "Company Name",
          "role": "Job Title",
          "location": "City, State",
          "dates": "Date range",
          "points": ["Bullet point 1", "Bullet point 2"]
        }
      ],
      "projects": [
        {
          "title": "Project Name",
          "technologies": "List of technologies",
          "date": "Date",
          "points": ["Bullet point 1", "Bullet point 2"],
          "link": "GitHub/Live link"
        }
      ],
      "skills": {
        "languages": "Languages list",
        "frontend": "Frontend list",
        "backend": "Backend/System list",
        "aiMl": "AI/ML list",
        "tools": "Tools/DevOps list"
      },
      "honors": ["Honor 1", "Honor 2"]
    }
    
    RETURN ONLY THE JSON. NO PREAMBLE.
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

  let lastError: any = null;

  for (const model of MODELS) {
    try {
      console.log(`Parsing with model: ${model}`);
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages: [{ role: 'user', content: prompt }]
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://moubapply.com',
            'X-Title': 'MoubApply'
          },
          timeout: 45000
        }
      );

      const content = response.data.choices[0].message.content;

      // Robust Extraction
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");

      const jsonString = jsonMatch[0];
      let data: any = null;

      try {
        data = JSON.parse(jsonString);
      } catch {
        console.log("JSON Parse failed, attempting to fix common LaTeX escape issues...");
        const fixedJson = jsonString.replace(/(?<!\\)\\(?![\\/bfnrtu"])/g, '\\\\');
        data = JSON.parse(fixedJson);
      }

      return data;

    } catch (error: any) {
      lastError = error;
      console.warn(`Parsing model ${model} failed: ${error.message}`);
      if (error.response?.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  // Final fallback: Try Hugging Face Inference API
  console.log('[Fallback] Trying Hugging Face Inference API...');
  const hfResult = await parseResumeWithHF(resumeText);
  if (hfResult) {
    console.log('[HF] Successfully parsed resume with Hugging Face!');
    return hfResult;
  }

  // Ultimate fallback: Try NVIDIA NIM API
  console.log('[Fallback] Trying NVIDIA NIM API...');
  const nvidiaResult = await parseResumeWithNVIDIA(resumeText);
  if (nvidiaResult) {
    console.log('[NVIDIA] Successfully parsed resume with NVIDIA!');
    return nvidiaResult;
  }

  // Last resort: Try Groq (very fast)
  console.log('[Fallback] Trying Groq API...');
  const groqResult = await parseResumeWithGroq(resumeText);
  if (groqResult) {
    console.log('[GROQ] Successfully parsed resume with Groq!');
    return groqResult;
  }

  throw new Error(`Failed to parse resume after trying all providers (OpenRouter, HF, NVIDIA, Groq). Last error: ${lastError?.message}`);
};
