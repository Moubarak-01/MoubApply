import axios from 'axios';
import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';

export const enrichJobWithAI = async (jobId: string, userId: string) => {
  try {
    const job = await Job.findById(jobId);
    const user = await User.findById(userId);

    if (!job) throw new Error('Job not found');
    if (!user) throw new Error('User not found');

    if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY is not defined');
    }

    const prompt = `
      Compare this Resume and Job Description. 
      Resume: "${user.masterResumeText}"
      Job Description: "${job.rawDescription}"
      
      Provide a JSON response with: 
      matchScore (0-100), 
      whyYouWillLoveIt (1 sentence), 
      theCatch (1 sentence), 
      and topSkills (array of 3 strings).
      
      Return ONLY the JSON.
    `;

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-small-3.1-24b-instruct:free', 
        messages: [
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://moubapply.com', // Required by OpenRouter
          'X-Title': 'MoubApply'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    const content = response.data.choices[0].message.content;
    
    // Clean up potential markdown formatting (```json ... ```)
    const jsonString = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let aiData;
    try {
        aiData = JSON.parse(jsonString);
    } catch (e) {
        console.error("Failed to parse AI response", content);
        throw new Error("Invalid JSON from AI");
    }

    // Update Job Document
    job.matchScore = aiData.matchScore;
    job.aiSummary = {
        whyYouWillLoveIt: aiData.whyYouWillLoveIt,
        theCatch: aiData.theCatch,
        topSkills: aiData.topSkills
    };

    await job.save();
    return job;

  } catch (error) {
    console.error('AI Matching Error:', error);
    throw error;
  }
};
