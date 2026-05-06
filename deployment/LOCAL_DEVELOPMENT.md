# Local Development Setup

This guide helps you run Samvada locally before deploying.

---

## Prerequisites

- Node.js 18+ ([download](https://nodejs.org))
- npm or yarn
- Groq API key ([get free key](https://console.groq.com))
- Supabase account ([sign up](https://supabase.com))

---

## Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/samvada.git
cd samvada

# Install all dependencies
npm run install:all
```

---

## Step 2: Setup Supabase

### Create Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for database to provision (~2 minutes)

### Get Database Credentials
Go to **Settings** → **Database** and copy:
- Host: `db.xxxxx.supabase.co`
- Port: `6543`
- Database: `postgres`
- User: `postgres`
- Password: (your project password)

### Create Storage Bucket
1. Go to **Storage** in Supabase dashboard
2. Click **New bucket**
3. Name: `samvada-audio`
4. Public: **OFF** (keep private)
5. Click **Create bucket**

### Get API Keys
Go to **Settings** → **API** and copy:
- URL: `https://xxxxx.supabase.co`
- service_role key: (secret key)

---

## Step 3: Configure Backend

```bash
cd samvada-backend
cp .env.backend .env
```

Edit `.env` with your credentials:

```env
PORT=3000
NODE_ENV=development

ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001

GROQ_API_KEY=your_groq_api_key_here

DB_HOST=db.xxxxx.supabase.co
DB_PORT=6543
DB_USER=postgres
DB_PASS=your_supabase_password
DB_NAME=postgres

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

---

## Step 4: Configure Frontend

```bash
cd ../samvada-frontend
cp .env.frontend .env
```

Edit `.env`:

```env
VITE_BACKEND_URL=http://localhost:3000
```

---

## Step 5: Run Development Servers

### Option 1: Run Both Together (Recommended)

From the root directory:

```bash
npm run dev
```

This starts:
- Backend on `http://localhost:3000`
- Frontend on `http://localhost:5173`

### Option 2: Run Separately

**Terminal 1 - Backend:**
```bash
cd samvada-backend
npm run start:dev
```

**Terminal 2 - Frontend:**
```bash
cd samvada-frontend
npm run dev
```

---

## Step 6: Test the Application

1. Open `http://localhost:5173` in your browser
2. Click **Start Call**
3. Allow microphone access
4. Speak in Kannada, Hindi, or English
5. The AI should respond with transcription

### Test Agent Dashboard

Open `http://localhost:5173/agent` to see the agent dashboard.

### Test History Page

Open `http://localhost:5173/agent/history` to see call history.

---

## Troubleshooting

### "Cannot connect to database"

**Check:**
- Supabase project is active (not paused)
- Database credentials in `.env` are correct
- Port is `6543` (not `5432`)

**Fix:**
```bash
# Test connection
cd samvada-backend
npm run start:dev
# Check logs for database connection errors
```

### "GROQ_API_KEY not found"

**Check:**
- `.env` file exists in `samvada-backend/`
- `GROQ_API_KEY` is set correctly
- No extra spaces or quotes

**Fix:**
```bash
cd samvada-backend
cat .env | grep GROQ_API_KEY
# Should show: GROQ_API_KEY=gsk_xxxxx
```

### "Failed to upload audio"

**Check:**
- `samvada-audio` bucket exists in Supabase Storage
- `SUPABASE_SERVICE_KEY` is the **service_role** key (not anon key)
- Bucket is private (not public)

**Fix:**
1. Go to Supabase → Storage
2. Verify `samvada-audio` bucket exists
3. Check bucket settings (should be private)

### Frontend can't connect to backend

**Check:**
- Backend is running on port 3000
- `VITE_BACKEND_URL` in frontend `.env` is `http://localhost:3000`
- No CORS errors in browser console

**Fix:**
```bash
# Restart both servers
# Terminal 1
cd samvada-backend
npm run start:dev

# Terminal 2
cd samvada-frontend
npm run dev
```

### Microphone not working

**Check:**
- Browser has microphone permission
- Using HTTPS or localhost (required for mic access)
- Microphone is not used by another app

**Fix:**
- Chrome: Settings → Privacy → Site Settings → Microphone
- Firefox: Preferences → Privacy → Permissions → Microphone

---

## Development Tips

### Hot Reload

Both frontend and backend support hot reload:
- **Backend:** Changes auto-restart the server
- **Frontend:** Changes auto-refresh the browser

### Database Schema Changes

The app uses TypeORM with `synchronize: true` in development, which auto-creates/updates tables.

**To see tables:**
1. Go to Supabase → Table Editor
2. You should see: `session`, `transcript`, `feedback`

### Viewing Logs

**Backend logs:**
```bash
cd samvada-backend
npm run start:dev
# Logs appear in terminal
```

**Frontend logs:**
- Open browser DevTools (F12)
- Go to Console tab

### Testing Different Languages

The app supports:
- **Kannada** (kn)
- **Hindi** (hi)
- **English** (en)

Whisper auto-detects the language. Speak clearly for best results.

---

## Building for Production

### Backend

```bash
cd samvada-backend
npm run build
npm run start:prod
```

### Frontend

```bash
cd samvada-frontend
npm run build
npm run preview
```

---

## Environment Variables Reference

### Backend (.env)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (development/production) |
| `ALLOWED_ORIGINS` | Yes | Comma-separated frontend URLs |
| `GROQ_API_KEY` | Yes | Groq API key for STT/LLM/TTS |
| `DB_HOST` | Yes | Supabase database host |
| `DB_PORT` | Yes | Database port (6543) |
| `DB_USER` | Yes | Database user (postgres) |
| `DB_PASS` | Yes | Database password |
| `DB_NAME` | Yes | Database name (postgres) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |

### Frontend (.env)

| Variable | Required | Description |
|---|---|---|
| `VITE_BACKEND_URL` | Yes | Backend API URL |

---

## Next Steps

Once local development is working:
1. Read [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) to deploy
2. Follow [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

---

## Need Help?

- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed troubleshooting
- Review Supabase docs: https://supabase.com/docs
- Review NestJS docs: https://docs.nestjs.com
- Review Vite docs: https://vitejs.dev
