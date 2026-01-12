import axios from 'axios';
import { Job } from '../models/Job.schema';
import { User } from '../models/User.schema';
import { compileLatex } from './latexCompiler';

// THE UNIVERSAL TEMPLATE - Using String.raw to prevent backslash escaping issues
const UNIVERSAL_TEMPLATE = String.raw`
\documentclass[letterpaper,11pt]{article}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{fontawesome5}
\usepackage{multicol}
\setlength{\multicolsep}{-3.0pt}
\setlength{\columnsep}{-1pt}
\input{glyphtounicode}
\usepackage[margin=1.4cm]{geometry}
\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}
\addtolength{\oddsidemargin}{-0.15in}
\addtolength{\textwidth}{0.3in}
\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}
\titleformat{\section}{\vspace{-4pt}\scshape\raggedright\large\bfseries}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]
\pdfgentounicode=1
\newcommand{\resumeItem}[1]{\item\small{{#1 \vspace{0pt}}}}
\newcommand{\resumeSubheading}[4]{\vspace{-2pt}\item\begin{tabular*}{1.0\textwidth}[t]{l@{\extracolsep{\fill}}r}\textbf{#1} & \textbf{\small #2} \\ \textit{\small#3} & \textit{\small #4} \\ \end{tabular*}\vspace{-7pt}}
\newcommand{\resumeProjectHeading}[2]{\item\begin{tabular*}{1.001\textwidth}{l@{\extracolsep{\fill}}r}\small#1 & \textbf{\small #2}\\\end{tabular*}\vspace{-7pt}}
\renewcommand\labelitemi{\vcenter{\hbox{\tiny$\bullet$}}}
\renewcommand\labelitemii{\vcenter{\hbox{\tiny$\bullet$}}}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.0in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}\vspace{0pt}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}}\vspace{-5pt}}

\begin{document}

%---HEADING---
\begin{center}
    {\Large \scshape {{FULL_NAME}}} \\ \vspace{2pt}
    \footnotesize \faPhone\ {{PHONE}} ~ 
    \faEnvelope\ \href{mailto:{{EMAIL}}}{{EMAIL}} ~ 
    \faLinkedin\ \href{{{LINKEDIN}}}{{{LINKEDIN_SHORT}}} ~ 
    \faGithub\ \href{{{GITHUB}}}{{{GITHUB_SHORT}}}
    \vspace{-8pt}
\end{center}

%---EDUCATION---
\section{Education}
  \resumeSubHeadingListStart
    {{EDUCATION_BLOCK}}
  \resumeSubHeadingListEnd
  \vspace{-12pt}

%---EXPERIENCE---
\section{Experience}
    \resumeSubHeadingListStart
        {{EXPERIENCE_BLOCK}}
    \resumeSubHeadingListEnd
    \vspace{-12pt}

%---PROJECTS---
\section{Technical Projects} 
    \resumeSubHeadingListStart
        {{PROJECTS_BLOCK}}
    \resumeSubHeadingListEnd
    \vspace{-12pt}

%---Technical Skills---
\section{Technical Skills}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{   
     \textbf{Languages}{: {{SKILLS_LANGUAGES}}} \\
     \textbf{Frontend}{: {{SKILLS_FRONTEND}}} \\
     \textbf{Backend & System}{: {{SKILLS_BACKEND}}} \\
     \textbf{AI & ML}{: {{SKILLS_AI_ML}}} \\
     \textbf{Tools}{: {{SKILLS_TOOLS}}}
    }}
 \end{itemize}

%---AFFILIATIONS---
\section{Affiliations & Honors}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{
      {{HONORS_LIST}}
    }}
 \end{itemize}
\vspace{-12pt}
\end{document}
`;

export const tailorResume = async (userId: string, jobId: string) => {
  try {
    const job = await Job.findById(jobId);
    const user = await User.findById(userId);

    if (!job || !user || !user.structuredExperience) {
        throw new Error('Missing data or resume not yet structured.');
    }

    // Check if profile is essentially empty
    const profile = user.structuredExperience as any;
    if (!profile.personalInfo?.fullName && (!profile.experience || profile.experience.length === 0)) {
        throw new Error('Your profile appears to be empty. Please re-upload your resume.');
    }

    console.log(`🪄 AI Tailoring Universal Template for: ${job.title}...`);

    const prompt = `
      You are an expert LaTeX resume tailor. 
      I will provide:
      1. A Structured User Profile (JSON)
      2. A Job Description
      
      YOUR TASK:
      Generate the tailored sections of the resume in LaTeX format.
      Focus on highlighting skills and experiences that directly match the job description.
      Use professional, action-oriented language.
      
      ### USER PROFILE:
      ${JSON.stringify(user.structuredExperience, null, 2)}
      
      ### JOB DESCRIPTION:
      "${job.rawDescription}"
      
      ### OUTPUT FORMAT:
      Return a JSON object with these fields (containing ONLY the LaTeX snippets for those sections):
      {
        "fullName": "Name",
        "phone": "Phone",
        "email": "Email",
        "linkedin": "Full URL",
        "linkedinShort": "e.g. linkedin.com/in/user",
        "github": "Full URL",
        "githubShort": "e.g. github.com/user",
        "educationBlock": "LaTeX code using \\\\resumeSubheading",
        "experienceBlock": "Tailored LaTeX code using \\\\resumeSubheading and \\\\resumeItem. Reword bullet points to match Job keywords and emphasize relevant achievements.",
        "projectsBlock": "Tailored LaTeX code using \\\\resumeProjectHeading and \\\\resumeItem. Select and reword projects to highlight relevant tech stack.",
        "skills": {
            "languages": "...",
            "frontend": "...",
            "backend": "...",
            "aiMl": "...",
            "tools": "..."
        },
        "honorsList": "Items separated by $\\\\cdot$"
      }
      
      STRICT RULES:
      1. Return ONLY the JSON object.
      2. Ensure ALL backslashes in LaTeX commands are properly escaped for JSON (e.g., use \\\\resumeItem instead of \\resumeItem).
      3. Do not include any text before or after the JSON.
      4. Use valid LaTeX syntax. For example, use \\\\& for ampersands and \\\\_ for underscores.
    `;

    const MODELS = [
        'google/gemini-2.0-flash-exp:free',
        'mistralai/mistral-small-3.1-24b-instruct:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free'
    ];

    let data: any = null;
    let lastError: any = null;

    for (const model of MODELS) {
        try {
            console.log(`Trying model: ${model}`);
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                { model, messages: [{ role: 'user', content: prompt }] },
                { 
                    headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
                    timeout: 30000 
                }
            );
            
            const content = response.data.choices[0].message.content;
            
            // Robust Extraction
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("No JSON found in response");
            
            const jsonString = jsonMatch[0];
            
            // Common Fix: Some models forget to escape backslashes even when told
            try {
                data = JSON.parse(jsonString);
            } catch {
                console.log("JSON Parse failed, attempting to fix common LaTeX escape issues...");
                const fixedJson = jsonString.replace(/(?<!\\)\\(?![\\/bfnrtu"])/g, '\\\\');
                data = JSON.parse(fixedJson);
            }
            
            if (data) break;
        } catch (err: any) {
            lastError = err;
            console.warn(`Model ${model} failed: ${err.message}`);
            if (err.response?.status === 429) {
                console.log("Rate limited, waiting 2s...");
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    if (!data) {
        throw new Error(`AI Tailoring failed on all models. Last error: ${lastError?.message}`);
    }

    // --- INJECTION ENGINE ---
    const finalTex = UNIVERSAL_TEMPLATE
        .replace(/{{FULL_NAME}}/g, data.fullName || user.name)
        .replace(/{{PHONE}}/g, data.phone)
        .replace(/{{EMAIL}}/g, data.email)
        .replace(/{{LINKEDIN}}/g, data.linkedin)
        .replace(/{{LINKEDIN_SHORT}}/g, data.linkedinShort)
        .replace(/{{GITHUB}}/g, data.github)
        .replace(/{{GITHUB_SHORT}}/g, data.githubShort)
        .replace(/{{EDUCATION_BLOCK}}/g, data.educationBlock)
        .replace(/{{EXPERIENCE_BLOCK}}/g, data.experienceBlock)
        .replace(/{{PROJECTS_BLOCK}}/g, data.projectsBlock)
        .replace(/{{SKILLS_LANGUAGES}}/g, data.skills.languages)
        .replace(/{{SKILLS_FRONTEND}}/g, data.skills.frontend)
        .replace(/{{SKILLS_BACKEND}}/g, data.skills.backend)
        .replace(/{{SKILLS_AI_ML}}/g, data.skills.aiMl)
        .replace(/{{SKILLS_TOOLS}}/g, data.skills.tools)
        .replace(/{{HONORS_LIST}}/g, data.honorsList);

    // Compile
    const outputName = `tailored_${job.company.replace(/\s+/g, '_')}_${userId.slice(-4)}`;
    const pdfPath = await compileLatex(finalTex, outputName);

    // Generate Cover Letter
    const clPrompt = `Write a professional 3-paragraph cover letter for ${data.fullName} for ${job.title} at ${job.company}. Job: ${job.rawDescription}. Use their experience: ${user.masterResumeText}. Return ONLY the letter text.`;
    const clRes = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'mistralai/mistral-small-3.1-24b-instruct:free',
          messages: [{ role: 'user', content: clPrompt }]
        },
        { headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` } }
    );

    return {
        pdfUrl: `/generated_pdfs/${outputName}.pdf`,
        coverLetter: clRes.data.choices[0].message.content
    };

  } catch (error) {
    console.error('Universal Tailoring Error:', error);
    throw error;
  }
};