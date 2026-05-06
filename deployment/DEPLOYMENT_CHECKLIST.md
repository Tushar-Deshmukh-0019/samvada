# Deployment Checklist ✅

Use this checklist to ensure everything is configured correctly before deploying.

---

## Pre-Deployment

### 1. Environment Files
- [ ] `samvada-backend/.env` exists and has all required variables
- [ ] `samvada-frontend/.env` exists with `VITE_BACKEND_URL`
- [ ] `.env` files are in `.gitignore` (never commit secrets!)

### 2. Supabase Setup
- [ ] Supabase project created
- [ ] Database credentials copied
- [ ] Storage bucket `samvada-audio` created
- [ ] Service role key copied

### 3. Groq API
- [ ] Groq account created at [console.groq.com](https://console.groq.com)
- [ ] API key generated and copied

### 4. Git Repository
- [ ] Code pushed to GitHub
- [ ] Repository is public or connected to Render/Vercel

---

## Backend Deployment (Render)

### 5. Render Service Created
- [ ] New Web Service created
- [ ] Repository connected
- [ ] Root directory set to `samvada-backend`
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm run start:prod`
- [ ] Instance type: **Free**

### 6. Environment Variables Set
- [ ] `NODE_ENV=production`
- [ ] `PORT=10000`
- [ ] `GROQ_API_KEY` (from Groq console)
- [ ] `DB_HOST` (from Supabase)
- [ ] `DB_PORT=6543`
- [ ] `DB_USER=postgres`
- [ ] `DB_PASS` (from Supabase)
- [ ] `DB_NAME=postgres`
- [ ] `SUPABASE_URL` (from Supabase)
- [ ] `SUPABASE_SERVICE_KEY` (from Supabase)
- [ ] `ALLOWED_ORIGINS` (will update after frontend deploy)

### 7. Backend Deployed
- [ ] Deployment successful (green checkmark in Render)
- [ ] Backend URL copied (e.g., `https://samvada-backend.onrender.com`)
- [ ] Test endpoint: `https://your-backend.onrender.com/sessions/stats` returns JSON

---

## Frontend Deployment (Vercel)

### 8. Vercel Project Created
- [ ] New Project created
- [ ] Repository imported
- [ ] Root directory set to `samvada-frontend`
- [ ] Framework preset: **Vite** (auto-detected)
- [ ] Build command: `npm run build` (auto-detected)
- [ ] Output directory: `dist` (auto-detected)

### 9. Environment Variable Set
- [ ] `VITE_BACKEND_URL` set to your Render backend URL

### 10. Frontend Deployed
- [ ] Deployment successful
- [ ] Frontend URL copied (e.g., `https://samvada.vercel.app`)
- [ ] Site loads without errors

---

## Post-Deployment

### 11. CORS Updated
- [ ] Go back to Render → Environment
- [ ] Update `ALLOWED_ORIGINS` to your Vercel frontend URL
- [ ] Save changes (triggers auto-redeploy)
- [ ] Wait for redeploy to complete

### 12. End-to-End Test
- [ ] Open frontend URL in browser
- [ ] Click "Start Call"
- [ ] Allow microphone access
- [ ] Speak in Kannada/Hindi/English
- [ ] AI responds with transcription
- [ ] Agent dashboard shows live transcript
- [ ] Audio playback works (if enabled)

### 13. Database Verification
- [ ] Go to Supabase → Table Editor
- [ ] Check that `session` table exists (auto-created by TypeORM)
- [ ] Check that `transcript` table exists
- [ ] Check that `feedback` table exists
- [ ] After a test call, verify data appears in tables

### 14. Storage Verification
- [ ] Go to Supabase → Storage → `samvada-audio`
- [ ] After a test call, verify audio files appear
- [ ] Files should be organized by session ID

---

## Optional: Keep Backend Awake

### 15. Uptime Monitor (Prevents Cold Starts)
- [ ] Sign up at [uptimerobot.com](https://uptimerobot.com)
- [ ] Create new HTTP(s) monitor
- [ ] URL: `https://your-backend.onrender.com/sessions/stats`
- [ ] Interval: 5 minutes
- [ ] Monitor active

---

## Troubleshooting

### Backend won't start
- Check Render logs for errors
- Verify all environment variables are set correctly
- Ensure Supabase database is active (not paused)

### Frontend can't connect to backend
- Check browser console for CORS errors
- Verify `VITE_BACKEND_URL` matches your Render URL exactly
- Verify `ALLOWED_ORIGINS` in Render includes your Vercel URL

### Database connection fails
- Check Supabase project status (Settings → General)
- Verify database credentials in Render environment variables
- Check that DB_PORT is `6543` (not `5432`)

### Audio upload fails
- Verify `samvada-audio` bucket exists in Supabase Storage
- Check that `SUPABASE_SERVICE_KEY` is the **service_role** key (not anon key)
- Verify bucket is private (not public)

### Cold starts (30+ second delay)
- This is normal for Render free tier after 15 minutes of inactivity
- Set up UptimeRobot to ping your backend every 5-10 minutes

---

## Production Readiness

Before launching to real users:

- [ ] Change `synchronize: true` to `false` in `database.module.ts`
- [ ] Set up TypeORM migrations for database schema changes
- [ ] Add rate limiting middleware
- [ ] Set up error monitoring (Sentry, LogRocket, etc.)
- [ ] Add custom domain (free on both Vercel and Render)
- [ ] Review Supabase Row Level Security policies
- [ ] Test with real Kannada and Hindi speakers
- [ ] Load test with multiple concurrent calls
- [ ] Set up backup strategy for database
- [ ] Document API endpoints
- [ ] Add health check endpoint

---

## Maintenance

### Updating Code
```bash
git add .
git commit -m "Your changes"
git push
```
Both Vercel and Render auto-deploy on push to `main`.

### Monitoring
- **Render:** Dashboard → Logs (real-time)
- **Vercel:** Dashboard → Deployments → Logs
- **Supabase:** Dashboard → Database → Logs
- **UptimeRobot:** Dashboard → Monitors

### Costs
All services used are **free forever** with the following limits:
- Vercel: 100GB bandwidth/month
- Render: Unlimited (but spins down after 15min idle)
- Supabase: 500MB database, 1GB storage
- Groq: 30 requests/minute
- UptimeRobot: 50 monitors

---

**All done?** 🎉 Your app is live and ready for users!
