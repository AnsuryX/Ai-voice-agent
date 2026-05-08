---
description: "Backend-specific patterns for FastAPI, async operations, and Supabase integration"
applyTo: "backend/**"
---

# Backend Instructions

## Architecture Patterns
- Use async/await for all I/O (httpx, Supabase)
- Service classes: AIOrchestrator (Groq API), LeadManager (Supabase), BookingManager (Cal.com)
- Singleton initialization via `init_services()` on first request
- Environment abstraction: `get_config()` supports Cloudflare env and local os.getenv

## Conventions
- Snake_case for files/methods, PascalCase for classes
- Exceptions caught with try/except, logged to console
- Secrets in .env (GROQ_API_KEY, WHATSAPP_TOKEN, etc.)
- Supabase upsert pattern for leads (sender_id unique)

## Pitfalls to Avoid
- Global state (orchestrator/lead_manager) not thread-safe for concurrent requests
- Silent failures: missing credentials only log warnings
- Unbounded chat history: no cleanup of chat_history table
- Incomplete integration: BookingManager exists but not called in webhook
- Hardcoded system prompt: not per-environment configurable
- No logging: only print() statements
- CORS allow all: restrict origins
- No retries/backoff for WhatsApp API

## Build & Test
- Install: `pip install -e .`
- Run: `python main.py`
- Database: `python setup_db.py` (manual Supabase SQL paste)

For bot persona and knowledge base, see [skills/real_estate_concierge.md](skills/real_estate_concierge.md).