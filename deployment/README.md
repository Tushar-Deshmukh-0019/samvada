# 🚀 Deployment Ready!

Your Samvada project is now configured for deployment on **Vercel (frontend)** and **Render (backend)** — both completely free, no credit card required.

---

## 📋 What Changed

### Backend (`samvada-backend/`)
- ✅ CORS now reads from `ALLOWED_ORIGINS` env variable
- ✅ Port binds to `0.0.0.0` (required by Render)
- ✅ Port reads from `PORT` env variable
- ✅ Added `render.yaml` for easy Render deployment
- ✅ Added `.env.backend` with all required variables

### Frontend (`samvada-frontend/`)
- ✅ Backend URL now reads from `VITE_BACKEND_URL` env variable
- ✅ Added `vercel.json` for SPA routing
- ✅ Added `.env.frontend` with backend URL config
- ✅ Updated `.gitignore` to exclude env files

### Root
- ✅ Added comprehensive deployment guides
- ✅ Added `.gitignore` for the monorepo

---

## 📚 Documentation

| File | Purpose |
|---|---|
| **[QUICK_DEPLOY.md](./QUICK_DEPLOY.md)** | 5-minute quick start guide |
| **[DEPLOYMENT.md](./DEPLOYMENT.md)** | Complete step-by-step deployment guide |
| **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** | Checklist to ensure everything is configured |

---

## 🎯 Quick Start

### 1. Set up environment files

**Backend:**
```bash
cd samvada-backend
cp .env.backend .env
# Edit .env with your actual credentials
```

**Frontend:**
```bash
cd samvada-frontend
cp .env.frontend .env
# Edit .env with your backend URL (after deploying backend)
```

### 2. Deploy Backend to Render

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect repo, set root to `samvada-backend`
4. Add environment variables from `.env.example`
5. Deploy → Copy backend URL

### 3. Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import repo, set root to `samvada-frontend`
3. Add `VITE_BACKEND_URL` environment variable
4. Deploy → Copy frontend URL

### 4. Update CORS

Go back to Render → Update `ALLOWED_ORIGINS` with your Vercel URL → Save

---

## 🔑 Required Credentials

Before deploying, you need:

1. **Groq API Key** — [Get free key](https://console.groq.com)
2. **Supabase Project** — [Create free project](https://supabase.com)
   - Database credentials (host, port, user, password)
   - Service role key
   - Storage bucket named `samvada-audio`

---

## 💰 Cost

**$0/month** — Everything runs on free tiers:
- Vercel: Free forever (100GB bandwidth/month)
- Render: Free forever (spins down after 15min idle)
- Supabase: Free forever (500MB DB, 1GB storage)
- Groq: Free tier (30 requests/min)

---

## ⚡ Preventing Cold Starts

Render's free tier spins down after 15 minutes of inactivity. To keep it awake:

1. Sign up at [uptimerobot.com](https://uptimerobot.com) (free)
2. Create HTTP monitor
3. Ping `https://your-backend.onrender.com/sessions/stats` every 5 minutes

---

## 🧪 Testing Your Deployment

1. Open your Vercel URL
2. Click "Start Call"
3. Allow microphone access
4. Speak in Kannada, Hindi, or English
5. AI should respond with transcription

---

## 🆘 Troubleshooting

**"Failed to connect"**
- Check `VITE_BACKEND_URL` in Vercel matches your Render URL
- Check `ALLOWED_ORIGINS` in Render includes your Vercel URL

**"Database connection failed"**
- Verify all `DB_*` variables in Render
- Check Supabase project is active

**Backend takes 30+ seconds**
- Normal on first request after idle (cold start)
- Set up UptimeRobot to prevent this

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed troubleshooting.

---

## 📖 Next Steps

1. Read [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) for fastest deployment
2. Follow [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) to ensure nothing is missed
3. Review [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed explanations

---

## 🎉 Ready to Deploy!

All configuration is done. Follow the guides above to get your app live in under 10 minutes.

**Questions?** Check the troubleshooting sections in the deployment guides.
