# Unstuck 🧠✨

An ADHD-friendly agentic calendar application designed to battle "executive dysfunction." Unstuck abstracts away the cognitive load of planning and time management so you can focus on taking action—one clear block at a time.

## 🚀 The Problem & Inspiration
Traditional task managers and calendars exacerbate ADHD symptoms by demanding meticulous manual scheduling and presenting overwhelming walls of text. Unstuck acts as an ambient assistant that handles the planning, breaking things down, and adjusting schedules dynamically so you don't have to.

## ✨ Key Features
- **Agentic Breakdown**: Brain dump massive tasks into our chat. Using Google Gemini 2.5 Flash, Unstuck parses your input, splits it into 1-5 tiny, highly specific subtasks, and assigns precise time estimates.
- **The "Honest Estimator"**: Unstuck calculates your personalized "Time Deviation Ratio" by tracking actual completion times versus estimates. It uses this background multiplier to protect you from overbooking yourself (Time Blindness).
- **Automated Workflow**: Native integrations with Google Workspace automatically generate templated Google Docs and draft Gmail emails behind the scenes when a subtask demands it. The "blank page syndrome" is solved before you even begin.
- **Ripple-Effect Rebalancing**: Uses Priority-Weighted Earliest Deadline First (PW-EDF). If you need an extra 15 minutes, hit a button. Unstuck ripples through your Google Calendar and safely pushes non-fixed events backward without missing hard deadlines.
- **Gamification (Gems & Streaks)**: Immediate dopamine hits. Earn gems per subtask and build streaks by completing full tasks. Crucially, we prevent "shame death" by allowing users to spend earned Gems to restore broken streaks if they miss a scheduled event!

## 💻 Tech Stack
- **Frontend**: Next.js (React), TypeScript, Tailwind CSS
- **Backend API**: Python, FastAPI
- **Database**: MongoDB (via Beanie ODM)
- **AI & Integrations**: Google Gemini API, Google Calendar API, Google Drive API, Google Docs API, Gmail API via Google OAuth 2.0
- **Hosting**: Vercel (Frontend), Render (Backend API via Docker Blueprint)

## 🛠️ Local Development Setup

To run Unstuck locally on your machine, you must run both the Frontend web server and the Backend API concurrently.

### 1. Start the Backend (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Or `.\venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8080 --env-file .env
```

### 2. Start the Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** to view it in the browser!

*(Note: You will need the appropriate `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, and a blank `MONGODB_URI` setup in your environment files to run local services fully).*