import os
import json
import httpx
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# For Cloudflare Workers compatibility
try:
    from workers import WorkerEntrypoint
    import asgi
except ImportError:
    # Local development
    class WorkerEntrypoint: pass
    asgi = None

load_dotenv()

app = FastAPI(title="Qatar Real Estate WhatsApp Bot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from orchestrator import AIOrchestrator
from database import LeadManager

# Global services that will be initialized per request or once
orchestrator = None
lead_manager = None

def get_config(key, env=None):
    if env and hasattr(env, key):
        return getattr(env, key)
    return os.getenv(key)

def init_services(env=None):
    global orchestrator, lead_manager
    if orchestrator is None:
        orchestrator = AIOrchestrator(api_key=get_config("GROQ_API_KEY", env))
    if lead_manager is None:
        lead_manager = LeadManager(
            url=get_config("SUPABASE_URL", env),
            key=get_config("SUPABASE_KEY", env)
        )

async def send_whatsapp_message(recipient_number: str, message_text: str, env=None):
    phone_id = get_config("WHATSAPP_PHONE_ID", env)
    token = get_config("WHATSAPP_TOKEN", env)
    
    url = f"https://graph.facebook.com/v21.0/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient_number,
        "type": "text",
        "text": {"body": message_text}
    }
    async with httpx.AsyncClient() as client:
        await client.post(url, headers=headers, json=payload)

@app.get("/")
async def root():
    return {"status": "online", "message": "Qatar Real Estate WhatsApp Bot API"}

@app.get("/webhook")
async def verify_webhook(request: Request):
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    
    # We need access to VERIFY_TOKEN from env/config
    verify_token = get_config("WHATSAPP_VERIFY_TOKEN", getattr(request.state, "env", None))

    if mode == "subscribe" and token == verify_token:
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")

@app.post("/webhook")
async def handle_webhook(request: Request):
    env = getattr(request.state, "env", None)
    init_services(env)
    
    body = await request.json()
    if body.get("object") == "whatsapp_business_account":
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])
                if messages:
                    msg = messages[0]
                    sender_id = msg.get("from")
                    if msg.get("type") == "text":
                        user_text = msg["text"]["body"]
                        await lead_manager.save_message(sender_id, user_text, "user")
                        ai_response = await orchestrator.get_response(user_text)
                        await lead_manager.save_message(sender_id, ai_response, "assistant")
                        await send_whatsapp_message(sender_id, ai_response, env)
        return {"status": "success"}
    return {"status": "ignored"}

class Default(WorkerEntrypoint):
    async def fetch(self, request, env, ctx):
        # Bridge Cloudflare Worker request to FastAPI
        # We store env in request state so our endpoints can access it
        init_services(env)
        return await asgi.fetch(app, request, env)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
