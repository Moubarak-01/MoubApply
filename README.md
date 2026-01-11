# JobSwipe - Smart Job Application Tracker

A "Tinder-style" job application interface built to streamline the process of finding and tracking internships and full-time roles. This project helps manage the application pipeline with a daily limit focus (20-30 high-quality applications).

## 🚀 Features Implemented

### 1. Discovery (The Swipe Deck)
- **Tinder-Like Interface**: Built with `framer-motion` for smooth drag gestures.
- **Actions**:
  - **Swipe Right**: Adds job to the "Queue" (Apply).
  - **Swipe Left**: Rejects the job.
- **Visual Feedback**: Dynamic background colors (Green for apply, Red for reject) during interaction.
- **Smart Stacking**: Uses a card stack layout with depth effects.

### 2. Job Cards
- **Match Score**: Displays an AI-generated match percentage (e.g., "98% Match").
- **Quick Tags**: Highlights key info like "Remote", "Summer 2026", "Visa Sponsored".
- **Graduation Check**: Automatically flags if the job's graduation year requirement doesn't match the user's profile (e.g., Red warning text).

### 3. Application Tracker
- **Kanban Board**: A dashboard to track application status.
- **Columns**:
  - **Queued**: Jobs approved via swipe.
  - **Processing**: Currently being handled by the automation agent.
  - **Applied**: Successfully submitted applications.
  - **Action Needed**: Applications stuck on CAPTCHAs or requiring manual input.

### 4. Job Detail Modal
- **Deep Dive**: Click any card to open a detailed modal.
- **AI Summary**: (UI Placeholder) displays "Why you'll love it", "The catch", and "Top 3 Skills".
- **Requirements**: Full text view of the job description.

## 🛠 Tech Stack

- **Framework**: React 19 + TypeScript (via Vite)
- **Styling**: Tailwind CSS v3
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Utils**: `clsx`, `tailwind-merge`

## ⚙️ Setup & Running

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Build for Production**:
   ```bash
   npm run build
   ```

## 📝 Recent Updates

- **Fix (WSL Compatibility)**: Downgraded Tailwind CSS from v4 to v3.4.17 to resolve `lightningcss` binary mismatch issues between Linux (WSL) and Windows environments.
- **Architecture**: Established the core layout with Sidebar navigation and routed views for Discovery, Tracker, and Profile.