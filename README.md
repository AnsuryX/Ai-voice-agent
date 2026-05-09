# Qatar Real Estate AI Dashboard and WhatsApp Bot

This repository contains a Qatar Real Estate lead dashboard and a WhatsApp bot backend.
The backend captures incoming WhatsApp conversations and stores them in Supabase.
The frontend reads Supabase data and displays a real-time dashboard for leads and chat history.

## Architecture

- **Backend:** `backend/main.py` (FastAPI) and `backend/api/index.py` (Cloudflare Worker-compatible)
- **Database:** Supabase PostgreSQL tables `leads` and `chat_history`
- **AI:** Groq LLM via `backend/orchestrator.py`
- **Frontend:** `frontend/app/page.tsx` using Next.js and Supabase JS
- **Realtime updates:** Supabase Realtime subscription on the `leads` table

## What this app does

- Receives WhatsApp messages via a webhook
- Saves chat messages into `chat_history`
- Ensures that a lead row exists in the `leads` table for every new sender
- Displays leads in a dashboard with search, lead details, and chat history views

## Setup

### 1. Backend

1. Copy `backend/.env.example` to `backend/.env`
2. Fill in your environment values:
   - `WHATSAPP_TOKEN`
   - `WHATSAPP_PHONE_ID`
   - `WHATSAPP_VERIFY_TOKEN`
   - `GROQ_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `CAL_API_KEY` (optional)
   - `DEEPGRAM_API_KEY` (optional)

3. Install Python dependencies:

```powershell
cd "c:\Users\Ayoub ansari\OneDrive\Documents\Ai voice agent\backend"
python -m pip install -r cf-requirements.txt
```

4. Create your Supabase tables.
   - Run `python setup_db.py` in the backend folder.
   - Copy the SQL printed by the script into the Supabase SQL editor.

5. Run the backend locally:

```powershell
python main.py
```

### 2. Frontend

1. Copy or create `frontend/.env.local`
2. Add these values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

3. Install frontend dependencies:

```powershell
cd "c:\Users\Ayoub ansari\OneDrive\Documents\Ai voice agent\frontend"
npm install
```

4. Run the frontend locally:

```powershell
npm run dev
```

5. Build for production:

```powershell
npm run build
```

> If you deploy this app to a static host, make sure the Supabase environment variables are available at build time.

## How the backend and frontend work together

- The backend writes lead and chat data directly into Supabase.
- The frontend reads from Supabase to display live dashboard data.
- The two are connected through the shared Supabase database, not through a direct HTTP frontend-to-backend API.

## Usage

1. Send a WhatsApp message to the configured WhatsApp bot.
2. The backend webhook saves the message and ensures a lead record exists.
3. The frontend dashboard will show the new lead and chat history shortly after the message is recorded.

## Notes

- The frontend navigation has been improved so the dashboard is now interactive across sections:
  - Dashboard
  - Leads
  - Appointments
  - Chat History
- The backend now creates lead table rows for incoming WhatsApp conversations, so the dashboard receives real data.
- If you need a direct backend API route for the dashboard in the future, that can be added as a separate layer.
