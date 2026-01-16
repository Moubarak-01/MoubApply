# MoubApply - AI-Powered Job Application Agent

MoubApply is a sophisticated, full-stack application designed to automate and optimize the job search process. It combines a "Tinder-style" discovery interface with a **multi-provider AI engine** featuring a robust **Waterfall Fallback System** and a **Playwright-powered automation agent**.

## 🚀 Key Features

### 1. **Discovery & Smart Matching**
- **Tinder-style Swipe Deck**: Built with `framer-motion` for fluid job discovery. Swipe Right to apply, Left to skip.
- **AI Matching Engine**: Analyzes your resume against job postings using a priority cascade:
    1.  **Xiaomi MiMo-V2-Flash** (Priority Matching)
    2.  **Meta Llama 3.3 70B** (Deep Analysis)
    3.  **Fallback Cluster** (Gemini, Mistral, Qwen, etc.)
- **AI Job Summaries**: Generates "Why you'll love it" and "The catch" insights for every role.

### 2. **Floating AI Career Assistant**
- **Global Access**: A persistent, draggable chat bubble available anywhere in the app (Toggle: `Shift + A`).
- **Smart Model Selection**: Prioritizes **Llama 3.3 70B** for high-quality chat, automatically falling back to lighter models if rate-limited.
- **Resume-Aware**: Reads your uploaded files to answer specific questions about your experience.
- **Voice Input**: Built-in speech-to-text using local Whisper transcription.

### 3. **Smart Tracker & Automation**
- **Kanban Board**: Track jobs from `Queued` → `Applied`.
- **⚡ Auto-Apply Agent**: Uses **Playwright** to launch a browser, detect the ATS (Greenhouse, Lever, Workday), and auto-fill forms.
- **AI-Driven Form Filling**: Uses the `aiQuestionAnswerer` service to intelligently answer essay questions and complex dropdowns based on your profile.
- **Telemetry & Observability**: Real-time browser logs (clicks, navigation, errors) are forwarded to your backend terminal for full visibility.

### 4. **Profile & Resume Management**
- **Multi-File Upload**: Store up to 6 resumes.
- **Intelligent Parsing**: Extracts text from **PDF**, **DOCX**, and **TXT** files.
- **LaTeX Resume Generation**: Compiles professional PDFs using your custom LaTeX template.
- **Portability**: All user data is stored in MongoDB and can be permanently wiped with the "Delete Account" feature.

### 5. **Auto Theme Switching**
- **Time-Based Themes**: Automatically switches to Light (6AM-6PM) and Dark (6PM-6AM).

---

## 🤖 AI Provider Waterfall System

To combat the unreliability of free AI tiers, MoubApply uses a **Dynamic Waterfall Strategy**. 

**The algorithm**:
1.  **Attempt Priority Model**: Tries the user-preferred model (e.g., Xiaomi for matching).
2.  **Detect Failure**: If it receives a `429 Too Many Requests` or `404 Not Found`...
3.  **Instant Fallback**: It immediately retries with the next model in the chain.
4.  **Safety Net**: The chain ends with high-availability, low-traffic models (e.g., `Zephyr-7B`, `Toppy-M` ) to guarantee a response.

**Current Priority Chains**:
**Current Priority Chains**:
*   **Matching/Essays**: `Xiaomi MiMo-V2` → `Llama 3.3` → `Gemini 2.0` → **Hugging Face** (Mistral/Llama) → **NVIDIA NIM** (DeepSeek/Qwen) → **Groq** (Llama)
*   **Assistant Chat**: `Llama 3.3 70B` → `Mistral` → `Gemini` → **Hugging Face** → **NVIDIA NIM** → **Groq**

This multi-layered approach ensures that even if one provider (like OpenRouter) is down, the system seamlessly switches to another API provider.

---

## 🛠 Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons |
| **Backend** | Node.js (Express), TypeScript, MongoDB Atlas (Mongoose) |
| **AI Providers** | OpenRouter (aggregating Mistral, Meta, Google, Xiaomi, etc.) |
| **Automation** | Playwright (Headless/Headful Browser Automation) |
| **Resume** | LaTeX (MiKTeX/pdflatex), pdf-parse-fork, mammoth |
| **Speech** | Local Whisper STT |

---

## 🚧 Challenges Faced & Solutions

During the development of v2.0, we encountered and solved several critical engineering challenges:

### 1. Rate Limiting & The "Zombie" Process
*   **Challenge**: Free AI API tiers often return `429` errors during batch processing. Additionally, node processes on port `5000` were hanging, causing "Address in Use" errors.
*   **Solution**: 
    *   Implemented the **Waterfall Fallback** system to never fail on a single model error.
    *   Migrated the entire stack to **Port 5001** to bypass the "zombie" processes on 5000.
    *   Added **Explicit Telemetry** to `taskkill` commands to ensure clean shutdowns.

### 2. Frontend-Backend Visibility
*   **Challenge**: It was hard to know if the auto-applier was working or if the AI was thinking.
*   **Solution**: 
    *   **Browser-to-Terminal Log Forwarding**: We capture Playwright's console logs and print them in the backend terminal with emojis (e.g., `🖱️ [CLICK]`, `📝 [FILL]`).
    *   **Explicit Telemetry Events**: Added `POST /api/telemetry` calls for Profile Updates and AI Chats to confirm data flow.

### 3. Cross-Origin Resource Sharing (CORS)
*   **Challenge**: The PDF viewer and Resume Tailor required loading resources from local files, which browsers block by default.
*   **Solution**: Configured `Helmet` CSP directives to allow framing from `localhost:5173` and disabled `X-Frame-Options` for specific routes.

---

## ⚙️ Setup & Configuration

### 1. Prerequisites
- Node.js v18+
- MongoDB Atlas Account
- API Keys for OpenRouter (and optionally others)
- MiKTeX (for LaTeX PDF generation)

### 2. Backend Environment (`backend/.env`)

Create a `.env` file in the `backend/` directory:

```env
PORT=5001
MONGO_URI=your_mongodb_atlas_connection_string

# AI Providers
OPENROUTER_API_KEY=your_openrouter_key
# (Other keys optional if using OpenRouter)

# Job APIs
RAPIDAPI_KEY=your_rapidapi_key
RAPIDAPI_HOST=jsearch.p.rapidapi.com
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_APP_KEY=your_adzuna_app_key
```

### 3. Running the Application

**Terminal 1 (Backend)**:
```bash
cd backend
npm install
npm start
```
*Runs on http://localhost:5001*

**Terminal 2 (Frontend)**:
```bash
npm install
npm run dev
```
*Runs on http://localhost:5173*

---

## 📖 Usage Guide

1.  **Sign Up**: Create an account on the Signup screen.
2.  **Upload Resume**: Go to **Profile** and upload your PDF resume. **required** for AI features.
3.  **Discovery**: Swipe right on jobs to queue them.
4.  **Auto-Apply**: 
    - Go to **Tracker**.
    - Click **Auto-Apply** on a queued job.
    - The backend terminal will show the real-time progress of the bot.

---

## 🔐 Privacy Note

MoubApply is built for privacy:
- All uploaded files are deleted when the backend restarts.
- Resume text is cleared from the database on startup.
- Generated PDFs are auto-cleaned after application submission.
- **Delete Account** button permanently wipes all user data from MongoDB.

---

## 📄 License

MIT License - Built by [Moubarak01](https://github.com/Moubarak01)
