# MoubApply - AI-Powered Job Application Agent

MoubApply is a sophisticated, full-stack application designed to automate and optimize the job search process. It combines a "Tinder-style" discovery interface with a **multi-provider AI engine** featuring **70+ model fallbacks** and a **Playwright-powered automation agent**.

## 🚀 Key Features

### 1. **Discovery & Smart Matching**
- **Tinder-style Swipe Deck**: Built with `framer-motion` for fluid job discovery. Swipe Right to apply, Left to skip.
- **AI Matching Engine**: Analyzes your resume against job postings using a cascade of 70+ AI models to generate 0-100% match scores.
- **AI Job Summaries**: Generates "Why you'll love it" and "The catch" insights for every role.

### 2. **Floating AI Career Assistant**
- **Global Access**: A persistent, draggable, and resizable chat bubble available anywhere in the app.
- **Keyboard Toggle**: Press **`Shift + A`** to instantly show/hide the assistant.
- **Multi-Model Intelligence**: Rotates between **25+ high-performance models** (Gemini, Claude, GPT, DeepSeek, Qwen, Llama, etc.).
- **Voice Input**: Built-in speech-to-text using local Whisper transcription.
- **Rich Display**: Full support for **Markdown**, **Code Highlighting**, and **LaTeX/KaTeX** math formulas.
- **Resume-Aware**: Reads your uploaded files to answer specific questions about your experience.

### 3. **Smart Tracker & Automation**
- **Kanban Board**: Track jobs from `Queued` → `Applied`.
- **⚡ Auto-Apply Agent**: Uses **Playwright** to launch a browser and auto-fill application forms.
- **Human-in-the-Loop Review Modal**: Preview your tailored resume and cover letter before submission.
- **60-Second Pause**: Bot pauses before final submission for you to verify everything.
- **Cancel & Cleanup**: Cancel button deletes generated files and resets the application.

### 4. **Profile & Resume Management**
- **Multi-File Upload**: Store up to 6 resumes or cover letters.
- **Intelligent Parsing**: Extracts text from **PDF**, **DOCX**, and **TXT** files.
- **LaTeX Resume Generation**: Compiles professional PDFs using your custom LaTeX template.
- **Ephemeral Sessions**: All files are wiped on server restart for privacy.

### 5. **Auto Theme Switching**
- **Time-Based Themes**: Automatically switches to Light (6AM-6PM) and Dark (6PM-6AM).
- **Manual Override**: If you toggle manually, your preference persists.

---

## 🤖 AI Provider Waterfall (70+ Models)

MoubApply uses a **4-provider cascade** to ensure reliability:

| Priority | Provider | Models | Rate Limit Strategy |
|----------|----------|--------|---------------------|
| 1️⃣ | **OpenRouter** | 19 models | Gemini 3, Mistral, Llama, DeepSeek, Hermes, Qwen, etc. |
| 2️⃣ | **Hugging Face** | 5 models | Mistral-7B, Llama-3.2, Gemma-2, Qwen2.5, Phi-3 |
| 3️⃣ | **NVIDIA NIM** | 38 models | DeepSeek-R1, Llama-405B, Qwen-235B, Kimi-K2, etc. |
| 4️⃣ | **Groq** | 8 models | Llama-3.3-70B, Mixtral-8x7B (ultra-fast inference) |

If one provider is rate-limited, the system automatically falls through to the next.

---

## 🛠 Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons |
| **Backend** | Node.js (Express), TypeScript, MongoDB Atlas (Mongoose) |
| **AI Providers** | OpenRouter, Hugging Face Inference, NVIDIA NIM, Groq |
| **Automation** | Playwright (Browser Automation) |
| **Resume** | LaTeX (MiKTeX/pdflatex), pdf-parse-fork, mammoth |
| **Speech** | Local Whisper STT |

---

## ⚙️ Setup & Configuration

### 1. Prerequisites
- Node.js v18+
- MongoDB Atlas Account
- API Keys for OpenRouter, Hugging Face, NVIDIA, Groq
- MiKTeX (for LaTeX PDF generation)

### 2. Backend Environment (`backend/.env`)

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string

# AI Providers
OPENROUTER_API_KEY=your_openrouter_key
HF_TOKEN=your_huggingface_token
NVIDIA_API_KEY=your_nvidia_nim_key
GROQ_API_KEY=your_groq_key

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

**Terminal 2 (Frontend)**:
```bash
npm install
npm run dev
```

**Terminal 3 (Whisper STT - Optional)**:
```bash
cd backend
npm run whisper
```

---

## 📖 Usage Guide

1. **Sign Up**: Create an account on the Signup screen.
2. **Upload Resume**: Go to **Profile** and upload your PDF resume.
3. **Ingest Jobs**: Use the Discovery tab or run:
   ```bash
   curl -X POST http://localhost:5000/api/jobs/ingest -H "Content-Type: application/json" -d '{"query":"Software Engineer"}'
   ```
4. **Swipe**: Go to **Discovery** and swipe right on jobs you like.
5. **Auto-Apply**: 
   - Click **Auto-Apply** on a queued job.
   - Review the tailored resume and cover letter in the **Review Modal**.
   - Click **Approve & Apply** to start the browser automation.
   - The bot pauses 60 seconds before final submission for your review.

---

## 📁 Project Structure

```
MoubApply/
├── backend/
│   ├── services/
│   │   ├── aiMatcher.ts       # AI job matching
│   │   ├── resumeTailor.ts    # Resume customization + LaTeX
│   │   ├── resumeParser.ts    # Resume text extraction
│   │   ├── autoApplier.ts     # Playwright automation
│   │   ├── jobIngestor.ts     # Greenhouse, JSearch, Adzuna APIs
│   │   ├── groqService.ts     # Groq AI provider
│   │   ├── hfService.ts       # Hugging Face provider
│   │   ├── nvidiaService.ts   # NVIDIA NIM provider
│   │   └── latexCompiler.ts   # PDF generation
│   ├── models/                # MongoDB schemas
│   ├── templates/             # LaTeX resume template
│   └── index.ts               # Express server
├── src/
│   ├── components/
│   │   ├── AiAssistant.tsx    # Floating AI chat
│   │   ├── JobDeck.tsx        # Swipe interface
│   │   ├── JobDetailModal.tsx # Job details + Auto-Apply
│   │   ├── ReviewModal.tsx    # Resume/CL preview
│   │   └── Tracker.tsx        # Kanban board
│   ├── context/
│   │   ├── AuthContext.tsx    # Authentication
│   │   └── ThemeContext.tsx   # Auto theme switching
│   └── App.tsx
└── README.md
```

---

## 🔐 Privacy Note

MoubApply is built for privacy:
- All uploaded files are deleted when the backend restarts.
- Resume text is cleared from the database on startup.
- Generated PDFs are auto-cleaned after application submission.
- Cancel button triggers full cleanup of generated files.

---

## 📄 License

MIT License - Built by [Moubarak01](https://github.com/Moubarak01)
