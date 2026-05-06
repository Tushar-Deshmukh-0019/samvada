# Samvada — AI-Assisted Helpline System

AI-powered voice-to-voice assistant for the 1092 Karnataka Government Helpline.
Multilingual (Kannada, Hindi, English), emotion-aware, with a verification-first pipeline.

---

## Project Structure

```
samvada-backend/          NestJS backend (AI engine)
  src/
    websocket/            WebSocket gateway — orchestrates the full pipeline
    stt/                  Speech-to-text via Groq Whisper
    emotion/              Emotion & sentiment analysis via Groq LLM
    nlp/                  Intent extraction & NLP via Groq LLM
    verification/         Verification engine (core feature)
    priority/             Priority scoring (Critical / Moderate / Low)
    response/             Response generation + TTS
    session/              Session state management

samvada-frontend/         React + Vite frontend
  src/
    pages/
      CitizenPage.tsx     Citizen call interface (dialpad + call screen)
      AgentPage.tsx       Agent dashboard
    components/
      citizen/            DialPad, CallScreen
      agent/              CallList, TranscriptPanel, EmotionPanel, SummaryPanel
    hooks/
      useCallSession.ts   Citizen call state + socket events
      useAgentDashboard.ts Agent dashboard state + socket events
      useAudioRecorder.ts Microphone capture + audio streaming
    services/
      socket.ts           Socket.io client singleton
```

---

## Setup

### Local Development

See **[deployment/LOCAL_DEVELOPMENT.md](./deployment/LOCAL_DEVELOPMENT.md)** for complete setup instructions.

Quick start:

```bash
# Install dependencies
npm run install:all

# Setup environment files
cd samvada-backend
cp .env.backend .env
# Edit .env with your Groq API key and Supabase credentials

cd ../samvada-frontend
cp .env.frontend .env
# Edit .env with backend URL

# Run everything
cd ..
npm run dev
```

### Deployment

See **[deployment/README.md](./deployment/README.md)** for deployment instructions.

Quick deploy to Vercel + Render (free):
- **[deployment/QUICK_DEPLOY.md](./deployment/QUICK_DEPLOY.md)** — 5-minute guide
- **[deployment/DEPLOYMENT.md](./deployment/DEPLOYMENT.md)** — Complete step-by-step
- **[deployment/DEPLOYMENT_CHECKLIST.md](./deployment/DEPLOYMENT_CHECKLIST.md)** — Ensure nothing is missed

### Run everything with one command

```bash
npm run dev
```

This starts both the backend (NestJS, port 3000) and frontend (Vite, port 5173) together with colour-coded logs.

### Other commands

| Command | What it does |
|---|---|
| `npm run dev` | Start backend + frontend in dev/watch mode |
| `npm run build` | Build both for production |
| `npm run start` | Run production builds of both |
| `npm run install:all` | Install dependencies for both packages |

---

## Usage

- **Citizen UI**: http://localhost:5173 — Enter `1092` on the dialpad and call
- **Agent Dashboard**: http://localhost:5173/agent

---

## Pipeline

```
Citizen speaks → WebSocket → STT (Whisper) → Emotion + NLP (parallel)
→ Priority Score → Verification Engine
  ├── High confidence  → Confirmation question → Citizen confirms → Agent dashboard updated
  ├── Medium confidence → Re-verify (ask again)
  ├── Low confidence   → Escalate to human agent
  └── Critical         → Bypass verification → Immediate escalation
```

## Confidence Thresholds

| Score     | Action              |
|-----------|---------------------|
| ≥ 0.75    | Proceed             |
| 0.50–0.74 | Re-verify           |
| < 0.50    | Escalate to agent   |
| Critical emotion | Bypass → Escalate immediately |

---

## API Key

Get a free Groq API key at https://console.groq.com
