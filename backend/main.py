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
from flow_engine import FlowEngine
from pydantic import BaseModel
from typing import Optional

# Global services
orchestrator = None
lead_manager = None
flow_engine = None

class MessageRequest(BaseModel):
    recipient_number: str
    message_text: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = "text"

def get_config(key, env=None):
    if env and hasattr(env, key):
        return getattr(env, key)
    return os.getenv(key)

def init_services(env=None):
    global orchestrator, lead_manager, flow_engine
    if orchestrator is None:
        orchestrator = AIOrchestrator(api_key=get_config("GROQ_API_KEY", env))
    if lead_manager is None:
        lead_manager = LeadManager(
            url=get_config("SUPABASE_URL", env),
            key=get_config("SUPABASE_KEY", env)
        )
    if flow_engine is None:
        flow_engine = FlowEngine(lead_manager)

async def send_whatsapp_message(recipient_number: str, message_text: str = None, media_url: str = None, media_type: str = "text", env=None):
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
    }

    if media_type == "text" or not media_url:
        payload["type"] = "text"
        payload["text"] = {"body": message_text}
    else:
        payload["type"] = media_type
        payload[media_type] = {"link": media_url}
        if message_text and media_type in ["image", "video"]:
            payload[media_type]["caption"] = message_text

    async with httpx.AsyncClient() as client:
        await client.post(url, headers=headers, json=payload)

@app.get("/")
async def root():
    return {"status": "online", "message": "Qatar Real Estate WhatsApp Bot API"}

@app.post("/api/send-message")
async def manual_send_message(req: MessageRequest, request: Request):
    env = getattr(request.state, "env", None)
    init_services(env)
    
    await send_whatsapp_message(
        recipient_number=req.recipient_number,
        message_text=req.message_text,
        media_url=req.media_url,
        media_type=req.media_type,
        env=env
    )
    
    await lead_manager.save_message(
        sender_id=req.recipient_number,
        message=req.message_text,
        role="assistant",
        media_url=req.media_url,
        media_type=req.media_type
    )
    
    return {"status": "sent"}

@app.get("/webhook")
async def verify_webhook(request: Request):
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    
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
                    msg_type = msg.get("type")
                    
                    user_text = None
                    media_url = None
                    media_type = "text"

                    if msg_type == "text":
                        user_text = msg["text"]["body"]
                    elif msg_type in ["image", "video", "audio", "document"]:
                        media_type = msg_type
                        media_id = msg[msg_type].get("id")
                        # In a real app, we'd use media_id to get the URL from Meta API
                        # For now, we'll store a placeholder or caption
                        user_text = msg[msg_type].get("caption")
                        media_url = f"https://whatsapp-media-placeholder.com/{media_id}"

                    # Save incoming message
                    await lead_manager.save_message(sender_id, user_text, "user", media_url, media_type)
                    
                    # Get lead data for context
                    lead_data = await lead_manager.get_lead(sender_id)
                    if not lead_data:
                        await lead_manager.update_lead(sender_id)
                        lead_data = {"sender_id": sender_id}

                    # 1. Try Flow Engine
                    response_text = await flow_engine.process_message(sender_id, user_text, lead_data)
                    
                    # 2. If no flow, use AI Orchestrator
                    if not response_text and user_text:
                        chat_history = await lead_manager.get_chat_history(sender_id)
                        response_text = await orchestrator.get_response(user_text, chat_history)
                    
                    if response_text:
                        await lead_manager.save_message(sender_id, response_text, "assistant")
                        await send_whatsapp_message(sender_id, response_text, env=env)
                        
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
