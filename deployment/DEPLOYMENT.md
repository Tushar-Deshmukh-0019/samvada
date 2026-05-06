# Deployment Guide — Vercel + Render

This guide walks you through deploying Samvada on **Vercel (frontend)** and **Render (backend)** — both free, no credit card required.

---

## Prerequisites

- GitHub account (for connecting repos)
- Groq API key ([get one free](https://console.groq.com))
- Supabase account ([sign up free](https://supabase.com))

---

## Part 1: Deploy Backend to Render

### Step 1: Push your code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/samvada.git
git push -u origin main
```

### Step 2: Create Render Web Service

1. Go to [render.com](https://render.com) and sign up (no credit card needed)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `samvada-backend`
   - **Root Directory:** `samvada-backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start:prod`
   - **Instance Type:** `Free`

### Step 3: Add Environment Variables

In the Render dashboard, go to **Environment** and add:

```
NODE_ENV=production
PORT=10000
GROQ_API_KEY=your_groq_api_key_here
DB_HOST=your_supabase_db_host
DB_PORT=6543
DB_USER=postgres
DB_PASS=your_db_password
DB_NAME=postgres
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
ALLOWED_ORIGINS=https://your-app.vercel.app
```

**Important:** Leave `ALLOWED_ORIGINS` empty for now — you'll update it after deploying the frontend.

### Step 4: Deploy

Click **Create Web Service**. Render will build and deploy your backend. Copy the URL (e.g., `https://samvada-backend.onrender.com`).

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Create Vercel Project

1. Go to [vercel.com](https://vercel.com) and sign up
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `samvada-frontend`
   - **Build Command:** `npm run build` (auto-detected)
   - **Output Directory:** `dist` (auto-detected)

### Step 2: Add Environment Variable

In **Settings** → **Environment Variables**, add:

```
VITE_BACKEND_URL=https://samvada-backend.onrender.com
```

Replace with your actual Render backend URL from Part 1, Step 4.

### Step 3: Deploy

Click **Deploy**. Vercel will build and deploy your frontend. Copy the URL (e.g., `https://samvada.vercel.app`).

---

## Part 3: Update CORS

Go back to **Render** → your backend service → **Environment** and update:

```
ALLOWED_ORIGINS=https://samvada.vercel.app
```

Replace with your actual Vercel frontend URL. Click **Save Changes** — Render will auto-redeploy.

---

## Part 4: Setup Supabase Database

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to provision (~2 minutes)

### Step 2: Get Connection Details

Go to **Settings** → **Database** and copy:
- **Host:** `db.xxxxx.supabase.co`
- **Port:** `6543`
- **Database name:** `postgres`
- **User:** `postgres`
- **Password:** (the one you set during project creation)

### Step 3: Create Storage Bucket

1. Go to **Storage** in the Supabase dashboard
2. Click **New bucket**
3. Name: `samvada-audio`
4. **Public bucket:** OFF (keep private)
5. Click **Create bucket**

### Step 4: Get Service Role Key

Go to **Settings** → **API** and copy:
- **URL:** `https://xxxxx.supabase.co`
- **service_role key:** (secret key, never commit this)

### Step 5: Update Render Environment Variables

Go back to Render and update these variables with your Supabase details:

```
DB_HOST=db.xxxxx.supabase.co
DB_PORT=6543
DB_USER=postgres
DB_PASS=your_actual_password
DB_NAME=postgres
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

Click **Save Changes** — Render will redeploy with the database connected.

---

## Part 5: Prevent Cold Starts (Optional but Recommended)

Render's free tier spins down after 15 minutes of inactivity. Use a free uptime monitor to keep it awake:

### Option 1: UptimeRobot (Recommended)

1. Go to [uptimerobot.com](https://uptimerobot.com) and sign up (free)
2. Click **Add New Monitor**
3. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** Samvada Backend
   - **URL:** `https://samvada-backend.onrender.com/sessions/stats`
   - **Monitoring Interval:** 5 minutes
4. Click **Create Monitor**

### Option 2: Cron-job.org

1. Go to [cron-job.org](https://cron-job.org) and sign up
2. Create a new cron job that pings your backend URL every 10 minutes

---

## Testing Your Deployment

1. Open your Vercel frontend URL (e.g., `https://samvada.vercel.app`)
2. Click **Start Call** — you should see "Connecting..."
3. Allow microphone access
4. Speak in Kannada, Hindi, or English
5. The AI should respond with transcription and analysis

### Troubleshooting

**"Failed to connect"**
- Check that `VITE_BACKEND_URL` in Vercel matches your Render URL exactly
- Check that `ALLOWED_ORIGINS` in Render includes your Vercel URL

**"Database connection failed"**
- Verify all `DB_*` variables in Render match your Supabase connection details
- Check that your Supabase project is active (not paused)

**"Audio upload failed"**
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct
- Check that the `samvada-audio` bucket exists in Supabase Storage

**Backend takes 30+ seconds to respond**
- This is normal on the first request after 15 minutes of inactivity (cold start)
- Set up UptimeRobot to prevent this (see Part 5)

---

## Updating Your Deployment

### Frontend Changes

```bash
git add .
git commit -m "Update frontend"
git push
```

Vercel auto-deploys on every push to `main`.

### Backend Changes

```bash
git add .
git commit -m "Update backend"
git push
```

Render auto-deploys on every push to `main`.

---

## Cost Breakdown

| Service | Free Tier | Limits |
|---|---|---|
| **Vercel** | Forever free | 100GB bandwidth/month |
| **Render** | Forever free | Spins down after 15min idle |
| **Supabase** | Forever free | 500MB database, 1GB storage |
| **Groq** | Free tier | 30 requests/min |
| **UptimeRobot** | Forever free | 50 monitors |

**Total monthly cost: $0** 🎉

---

## Production Checklist

Before going live with real users:

- [ ] Set `synchronize: false` in `database.module.ts` and use TypeORM migrations
- [ ] Add rate limiting to prevent API abuse
- [ ] Set up error monitoring (e.g., Sentry free tier)
- [ ] Add logging (Render has built-in logs)
- [ ] Test with real Kannada/Hindi speakers
- [ ] Set up a custom domain (free on both Vercel and Render)
- [ ] Review Supabase Row Level Security policies
- [ ] Add health check endpoint for monitoring

---

## Support

- **Render Docs:** https://render.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **Supabase Docs:** https://supabase.com/docs

Need help? Open an issue on GitHub.
