# AI Agent Instructions for Qatar Real Estate Bot

This workspace contains a multilingual WhatsApp chatbot for Qatar real estate with an AI voice agent component. The project uses FastAPI backend with Groq LLM and Next.js frontend with Supabase.

## Build & Run Commands
- Backend: `cd backend && pip install -e . && python main.py` (runs on http://0.0.0.0:8000)
- Frontend: `cd frontend && npm run dev` (runs on http://localhost:3000)
- Database setup: `cd backend && python setup_db.py` (copy SQL to Supabase)

## Key Architecture
- Backend: Async FastAPI with service classes (AIOrchestrator, LeadManager, BookingManager)
- Frontend: Next.js static export with real-time Supabase subscriptions
- Deployment: Vercel for backend, Cloudflare Pages for frontend

## Conventions
- Async-first I/O operations
- Type safety with strict typing
- Clean architecture separation (routes, services, integrations)
- Premium UX with smooth transitions

## Common Pitfalls
- Global state in backend may not be thread-safe
- Missing error handling in frontend queries
- Hardcoded system prompts not configurable
- No retries for external API calls

For detailed architecture principles, see [GEMINI.md](GEMINI.md).
For project phases and tech stack, see [qatar-real-estate-bot.md](qatar-real-estate-bot.md).
For bot persona and workflows, see [backend/skills/real_estate_concierge.md](backend/skills/real_estate_concierge.md).