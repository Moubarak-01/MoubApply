import axios from 'axios';

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
    'google/gemini-2.0-flash-exp:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free'
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

  throw new Error(`Failed to parse resume after trying all models. Last error: ${lastError?.message}`);
};
