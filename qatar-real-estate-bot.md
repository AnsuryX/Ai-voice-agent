# Plan: Qatar Real Estate WhatsApp Bot (Open Source / Freemium)

## Objective
Build a commercial-grade, multilingual (English/Arabic) WhatsApp Bot for Qatar Real Estate that automates property inquiries and call/appointment booking.

## Tech Stack (Free/Freemium/Open Source)
- **Backend:** Python (FastAPI) - Highly efficient, async, and Vercel-ready.
- **LLM:** Groq (Llama 3 70B) - Ultra-fast, generous free tier for developers.
- **Messaging:** Meta WhatsApp Cloud API - Free for the first 1,000 conversations per month.
- **Voice (STT/TTS):** Deepgram - Best-in-class performance with a large free starter credit.
- **Booking Engine:** Cal.com (Free Tier) - Robust scheduling infrastructure with an API.
- **Hosting:** Vercel or Cloudflare Workers (using Python).
- **Database:** Supabase (Postgres) - Free tier for storing leads and chat history.

## Implementation Steps

### Phase 1: Infrastructure & Core Logic
1.  **Environment Setup:** Create `backend/requirements.txt` with `fastapi`, `groq`, `httpx`, `supabase`, `python-dotenv`.
2.  **WhatsApp Webhook:** Implement a FastAPI endpoint to receive and verify WhatsApp messages.
3.  **Multilingual LLM (Llama 3):** Configure Groq with a system prompt optimized for Qatar Real Estate (Luxury, Arabic/English, localized knowledge of Doha/Lusail).
4.  **Skill Orchestrator:** Implement the "Concierge" pattern to handle:
    -   **Inquiry Skill:** Answer property details.
    -   **Booking Skill:** Connect to Cal.com API to fetch slots and create bookings.
    -   **Lead Skill:** Save user data (Name, Phone, Intent) to Supabase.

### Phase 2: Features & Localizations
1.  **Arabic Support:** Ensure the LLM handles Qatari dialect/Modern Standard Arabic seamlessly.
2.  **Voice Interaction:** Enable users to send voice notes; backend uses Deepgram to transcribe and respond via text or voice.
3.  **Rich Content:** Use WhatsApp "Interactive Messages" (Buttons, Lists) for property selection and booking slots.
4.  **Qatar Localization:** Add logic for local areas (The Pearl, West Bay, Msheireb) and Sunday-Thursday/Friday-Saturday schedules.

### Phase 3: Deployment & Scaling
1.  **Vercel Deployment:** Configure `vercel.json` for a serverless Python backend.
2.  **Database Sync:** Connect Supabase to track all leads for the real estate client.
3.  **Dashboard (Optional):** A simple Next.js dashboard to visualize leads and appointments.

## Verification & Testing
- **Bilingual Test:** Send messages in Arabic and English to verify context switching.
- **Booking Test:** Verify that a WhatsApp interaction creates a real event in Cal.com.
- **Lead Capture:** Confirm data is correctly saved in Supabase.
