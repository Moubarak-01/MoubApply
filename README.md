<div align="center">

# MoubApply ✨

![Version](https://img.shields.io/badge/version-2.0-blueviolet?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![NodeJS](https://img.shields.io/badge/Node.js-18-339933?style=for-the-badge&logo=node.js)
![MongoDB](https://img.shields.io/badge/MongoDB-6.0-47A248?style=for-the-badge&logo=mongodb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)
![Playwright](https://img.shields.io/badge/Playwright-Automation-45ba4b?style=for-the-badge&logo=playwright)

**The Ultimate AI-Powered Job Application Agent & Career Assistant**

[Features](#-features-overview) • [Latest Updates](#-latest-updates-v20) • [Tech Stack](#-tech-stack) • [Installation](#-installation--setup) • [AI Architecture](#-ai-waterfall-architecture-defense-in-depth)

</div>

---

## 📖 Overview

MoubApply is a sophisticated, full-stack application designed to automate and optimize the job search process. It combines a "Tinder-style" discovery interface with a **multi-provider AI engine** featuring a robust **Waterfall Fallback System** and a **Playwright-powered automation agent**.

---

## 🆕 Latest Updates (v2.0)

### 1. Four-Tier AI Defense-in-Depth Architecture
We've engineered a military-grade fallback system to ensure zero downtime:

| Tier | Provider | Models | Purpose |
|:----:|:---------|:-------|:--------|
| **1** | **OpenRouter** | Xiaomi MiMo, Llama 3.3 70B, Gemini 2.0 | **Primary** - High Intelligence & Speed |
| **2** | **Hugging Face** | Mistral 7B, Zephyr 7B Beta | **Secondary** - Reliable Static Inference |
| **3** | **NVIDIA NIM** | DeepSeek R1, Qwen 2.5 | **Tertiary** - Enterprise-Grade Fallback |
| **4** | **Groq** | Llama 3 8B (Instant) | **Emergency** - Ultra-Low Latency |

### 2. Advanced Telemetry
- **Browser-to-Terminal Mirroring**: Watch Playwright click, type, and navigate in real-time on your backend console.
- **Explicit Event Logging**: Track every "AI Match" and "Profile Update" with dedicated API events.

### 3. Port Migration & Stability
- **Port 5001 Standard**: Migrated from 5000 to prevent zombie process conflicts.
- **Graceful Shutdown**: Enhanced signal handling to kill orphaned Chrome instances.

---

## 🌟 Features Overview

### 🛡️ Smart Tracking & Automation
- **Kanban Board**: Drag-and-drop tracking from `Queued` → `Applied`.
- **⚡ Auto-Apply Agent**: Launches a visible browser to auto-fill complex applications (Greenhouse, Lever, Workday).
- **AI Form Filler**: Uses the `aiQuestionAnswerer` service to intelligently write essays and select dropdowns based on your resume.

### 🤖 Floating AI Career Assistant
- **Global Access**: Press **`Shift + A`** anywhere to summon the assistant.
- **Context-Aware**: Reads your active resume to answer questions like *"Do I have enough React experience for this role?"*.
- **Voice-to-Text**: Built-in local Whisper transcription for voice commands.

### 🔍 Discovery Engine
- **Swipe Deck**: Fluid "Tinder-for-Jobs" interface.
- **Smart Enrich**: AI pre-analyzes every job to tell you *"Why you'll love it"* and *"The Catch"*.

---

## 🏗️ AI Waterfall Architecture ("Defense-in-Depth")

MoubApply uses a dynamic cascade to combat rate limits. It doesn't just retry—it **switches providers**.

1.  **Selection**: User picks a model (e.g., Xiaomi).
2.  **Detection**: If `429 Too Many Requests` occurs...
3.  **Switch**: The system instantly reroutes the prompt to **Hugging Face Inference API**.
4.  **Escalation**: If HF fails, it routes to **NVIDIA NIM**.
5.  **Last Resort**: Finally, it tries **Groq** for an guaranteed response.

---

## ⚙️ Environment Configuration

### Backend Environment (`/backend/.env`)

Create a file named `.env` inside the `backend/` folder. **Ensure all keys are populated for maximum reliability.**

```env
# Server Configuration
PORT=5001
MONGO_URI=mongodb+srv://...

# --------------------------
# 🤖 AI PROVIDER KEYS
# --------------------------

# 1. OpenRouter (Primary Aggregator)
OPENROUTER_API_KEY=sk-or-v1-...

# 2. Hugging Face (Fallback Layer 1)
HF_TOKEN=hf_...

# 3. NVIDIA NIM (Fallback Layer 2)
NVIDIA_API_KEY=nvapi-...

# 4. Groq (Emergency Layer 3)
GROQ_API_KEY=gsk_...

# --------------------------
# 🌍 JOB DATA SOURCES
# --------------------------
RAPIDAPI_KEY=...
RAPIDAPI_HOST=jsearch.p.rapidapi.com
ADZUNA_APP_ID=...
ADZUNA_APP_KEY=...
```

---

## 📦 Installation & Setup

### 1. Prerequisites
- Node.js v18+
- MongoDB Atlas Account
- MiKTeX (for LaTeX PDF generation)

### 2. Backend Setup
```bash
cd backend
npm install
npm start
```
*Runs on http://localhost:5001*

### 3. Frontend Setup
```bash
npm install
npm run dev
```
*Runs on http://localhost:5173*

---

## 📂 Project Structure

```
MoubApply/
├── backend/
│   ├── services/
│   │   ├── aiMatcher.ts       # Primary AI Logic
│   │   ├── nvidiaService.ts   # NVIDIA Fallback
│   │   ├── hfService.ts       # Hugging Face Fallback
│   │   └── autoApplier.ts     # Playwright Bot
│   └── index.ts               # Express API
├── src/
│   ├── components/
│   │   ├── AiAssistant.tsx    # Floating Chat
│   │   └── JobDeck.tsx        # Discovery UI
│   └── App.tsx
└── README.md
```

---

<div align="center">

**Built with ❤️ by [Moubarak01](https://github.com/Moubarak-01)**

</div>
