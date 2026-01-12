# MoubApply - AI-Powered Job Application Agent

MoubApply is a sophisticated, full-stack application designed to automate and optimize the internship search process. It combines a "Tinder-style" discovery interface with a high-performance AI matching engine and a Playwright-powered automation agent.

## 🚀 Key Features

### 1. **Discovery & Smart Matching**
-   **Tinder-style Swipe Deck**: Built with `framer-motion` for fluid job discovery. Swipe Right to apply, Left to skip.
-   **AI Matching Engine**: Automatically analyzes your resume against every job posting using **Mistral Small 3.1** to generate real-time 0-100% match scores.
-   **AI Job Summaries**: Generates concise "Why you'll love it" and "The catch" bullet points for every role.

### 2. **Floating AI Career Assistant**
-   **Global Access**: A persistent, draggable, and resizable chat bubble available anywhere in the app.
-   **Keyboard Toggle**: Press **`Shift + A`** to instantly show or hide the assistant.
-   **Multi-Model Intelligence**: Automatically rotates between **25 high-performance models** (Gemini, Claude, GPT, DeepSeek, etc.) in the background.
-   **Rich Display**: Full support for **Markdown**, **Code Highlighting**, and **LaTeX/KaTeX** math formulas.
-   **Resume-Aware**: The assistant reads your uploaded files to answer specific questions about your experience.

### 3. **Smart Tracker & Automation**
-   **Kanban Board**: Track jobs from `Queued` to `Applied`.
-   **⚡ Auto-Apply Agent**: Uses **Playwright** to launch a browser and automatically fill out application forms (Name, Email, LinkedIn, etc.) and upload your resume.
-   **Human-in-the-Loop**: The bot pauses before submission, allowing you to review the application for 100% accuracy.

### 4. **Profile & Resume Management**
-   **Multi-File Upload**: Store up to 6 resumes or cover letters.
-   **Intelligent Parsing**: Automatically extracts text from **PDF**, **DOCX (Word)**, and **TXT** files to update your AI profile.
-   **Ephemeral Sessions**: All uploaded files and extracted data are **completely wiped** from the server and database whenever the backend restarts, ensuring total privacy.

## 🛠 Tech Stack

-   **Frontend**: React + TypeScript, Tailwind CSS, Framer Motion, Lucide Icons.
-   **Backend**: Node.js (Express), TypeScript, MongoDB Atlas (Mongoose).
-   **AI Integration**: OpenRouter API (Mistral, Gemini, Claude, etc.).
-   **Automation**: Playwright (Browser Automation).
-   **Parsing**: `pdf-parse-fork`, `mammoth`.

## ⚙️ Setup & Configuration

### 1. Prerequisites
-   Node.js (v18+)
-   MongoDB Atlas Account
-   OpenRouter API Key

### 2. Backend Environment (`backend/.env`)
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string
OPENROUTER_API_KEY=your_openrouter_key
JWT_SECRET=your_random_secret_string
```

### 3. Running the Application

**Terminal 1 (Backend)**:
```bash
cd backend
npm install
npx ts-node index.ts
```

**Terminal 2 (Frontend)**:
```bash
npm install
npm run dev
```

## 📖 Usage Guide

1.  **Sign Up**: Create a new account. The app defaults to the Signup screen for new users.
2.  **Upload Resume**: Go to the **Profile** tab and upload your PDF resume. The AI will confirm it has read the text.
3.  **Ingest Jobs**: Fill your deck with jobs by running this command in a terminal:
    ```powershell
    Invoke-RestMethod -Uri "http://localhost:5000/api/jobs/ingest" -Method Post -Body '{"query":"Software Engineer Intern"}' -ContentType "application/json"
    ```
4.  **Swipe**: Go to the **Discovery** tab. Swipe right on jobs you like.
5.  **Auto-Apply**: Go to the **Tracker** tab. Click the **⚡ Auto-Apply** button on a queued job and watch the browser automate your application!

## 🔐 Privacy Note
MoubApply is built for privacy. Every time you stop and restart the backend server, all uploaded files are deleted from the filesystem and all resume text is cleared from the database.
