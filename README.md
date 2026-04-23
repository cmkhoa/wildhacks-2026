Unstuck 🧠✨
Project Overview
Unstuck is an ADHD-friendly, agentic calendar application designed to battle "executive dysfunction" by abstracting away the cognitive load of planning. Instead of demanding meticulous manual scheduling, the app acts as an ambient assistant where users can simply brain dump their massive tasks into a chat interface. The application was built using a Next.js (React) frontend paired with a Python FastAPI backend and a MongoDB database. To power the automated breakdown of tasks, we integrated the Google Gemini 2.5 Flash API, which parses the text into 1-5 specific subtasks and natively syncs them to Google Calendar and Docs via Google OAuth 2.0. A major technical challenge we fixed was schedule overlapping; to solve this, we implemented a Priority-Weighted Earliest Deadline First (PW-EDF) algorithm that safely "ripples" and pushes non-fixed events backward in the calendar whenever a user needs an extra 15 minutes.

Application Interface
The Planning Dashboard:
Here, users can utilize the chat interface to dump their tasks and let the AI break them down into bite-sized, manageable pieces.

<img width="2267" height="1409" alt="Screenshot 2026-04-23 123117" src="https://github.com/user-attachments/assets/a4750e1b-47c4-4315-9183-73e0da3a4da7" />


Focus Mode:
Once a task begins, Focus Mode isolates the current subtask to prevent overwhelming walls of text, tracking time and progress while keeping the AI assistant available for targeted help.
<img width="2274" height="1411" alt="Screenshot 2026-04-23 123153" src="https://github.com/user-attachments/assets/3cc63fdd-ca4e-40f3-bfcd-029110b342b5" />

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

Video Demonstration


🎥 [Watch the Unstuck Video Demonstration Here] (https://youtu.be/4uqO2ZzVXsA?si=5MoTvegYHpzLtxcu)
