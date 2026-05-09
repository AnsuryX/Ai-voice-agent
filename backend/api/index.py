import os
import json
import httpx
import re
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional

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
from booking import BookingManager

# Global services that will be initialized per request or once
orchestrator = None
lead_manager = None
flow_engine = None
booking_manager = None


class MessageRequest(BaseModel):
    recipient_number: str
    message_text: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = "text"


class ContactRequest(BaseModel):
    sender_id: str
    name: Optional[str] = None
    intent: Optional[str] = None
    area: Optional[str] = None
    status: Optional[str] = "Contact"


class ContactUpdateRequest(BaseModel):
    name: Optional[str] = None
    intent: Optional[str] = None
    area: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None
    assignee: Optional[str] = None


class BulkActionRequest(BaseModel):
    sender_ids: list[str]
    action: str
    value: Optional[str] = None


class FlowCreateRequest(BaseModel):
    name: str
    nodes: Optional[list] = None
    is_active: Optional[bool] = True


class FlowUpdateRequest(BaseModel):
    name: Optional[str] = None
    nodes: Optional[list] = None
    is_active: Optional[bool] = None

def get_config(key, env=None):
    if env and hasattr(env, key):
        return getattr(env, key)
    return os.getenv(key)

def init_services(env=None):
    global orchestrator, lead_manager, flow_engine, booking_manager
    if orchestrator is None:
        orchestrator = AIOrchestrator(api_key=get_config("GROQ_API_KEY", env))
    if lead_manager is None:
        lead_manager = LeadManager(
            url=get_config("SUPABASE_URL", env),
            key=get_config("SUPABASE_KEY", env)
        )
    if flow_engine is None:
        flow_engine = FlowEngine(lead_manager)
    if booking_manager is None:
        booking_manager = BookingManager()


def detect_booking_type(user_text: str):
    if not user_text:
        return None
    lower = user_text.lower()
    if any(k in lower for k in ["visit", "viewing", "tour", "property visit"]):
        return "visit"
    if any(k in lower for k in ["call", "phone call", "meeting", "book"]):
        return "call"
    return None


def extract_email(user_text: str):
    if not user_text:
        return None
    match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", user_text)
    return match.group(0) if match else None


async def try_create_cal_booking(sender_id: str, email: str, booking_type: str):
    event_key = "CAL_CALL_EVENT_TYPE_ID" if booking_type == "call" else "CAL_VISIT_EVENT_TYPE_ID"
    event_type_id = os.getenv(event_key)
    if not event_type_id:
        return None, f"Booking requested for {booking_type}, but {event_key} is missing in env."

    # Simple default slot: next day 10:00 AM Qatar time (07:00 UTC)
    now_utc = datetime.now(timezone.utc)
    start_utc = (now_utc + timedelta(days=1)).replace(hour=7, minute=0, second=0, microsecond=0)
    result = await booking_manager.create_booking(
        attendee_email=email,
        start_time=start_utc.isoformat(),
        event_type_id=int(event_type_id),
    )
    return result, None

async def send_whatsapp_message(
    recipient_number: str,
    message_text: str = None,
    media_url: str = None,
    media_type: str = "text",
    env=None,
):
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
        env=env,
    )

    await lead_manager.save_message(
        sender_id=req.recipient_number,
        message=req.message_text,
        role="assistant",
        media_url=req.media_url,
        media_type=req.media_type,
    )

    return {"status": "sent"}


@app.get("/api/contacts")
async def list_contacts(request: Request):
    env = getattr(request.state, "env", None)
    init_services(env)
    if not lead_manager or not lead_manager.supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    result = (
        lead_manager.supabase.table("leads")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@app.post("/api/contacts")
async def create_contact(req: ContactRequest, request: Request):
    env = getattr(request.state, "env", None)
    init_services(env)
    await lead_manager.update_lead(
        sender_id=req.sender_id,
        name=req.name,
        intent=req.intent,
        area=req.area,
        status=req.status,
    )
    await lead_manager.update_lead(
        sender_id=req.sender_id,
        flow_context={"notes": "", "tags": [], "assignee": ""},
    )
    return {"status": "created"}


@app.patch("/api/contacts/{sender_id}")
async def update_contact(sender_id: str, req: ContactUpdateRequest, request: Request):
    env = getattr(request.state, "env", None)
    init_services(env)
    existing = await lead_manager.get_lead(sender_id) or {}
    context = existing.get("flow_context") or {}
    if req.notes is not None:
        context["notes"] = req.notes
    if req.tags is not None:
        context["tags"] = req.tags
    if req.assignee is not None:
        context["assignee"] = req.assignee

    await lead_manager.update_lead(
        sender_id=sender_id,
        name=req.name,
        intent=req.intent,
        area=req.area,
        status=req.status,
        flow_context=context,
    )
    return {"status": "updated"}


@app.post("/api/contacts/bulk")
async def bulk_update_contacts(req: BulkActionRequest, request: Request):
    env = getattr(request.state, "env", None)
    init_services(env)
    if not lead_manager or not lead_manager.supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    for sender_id in req.sender_ids:
        lead = await lead_manager.get_lead(sender_id) or {}
        context = lead.get("flow_context") or {}
        if req.action == "status":
            await lead_manager.update_lead(sender_id=sender_id, status=req.value or "Contact")
        elif req.action == "assignee":
            context["assignee"] = req.value or ""
            await lead_manager.update_lead(sender_id=sender_id, flow_context=context)
        elif req.action == "add_tag":
            tags = context.get("tags") or []
            if req.value and req.value not in tags:
                tags.append(req.value)
            context["tags"] = tags
            await lead_manager.update_lead(sender_id=sender_id, flow_context=context)
    return {"status": "bulk-updated"}


@app.get("/api/flows")
async def list_flows(request: Request):
    env = getattr(request.state, "env", None)
    init_services(env)
    if not lead_manager or not lead_manager.supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    result = lead_manager.supabase.table("flows").select("*").order("created_at", desc=True).execute()
    return result.data or []


@app.post("/api/flows")
async def create_flow(req: FlowCreateRequest, request: Request):
    env = getattr(request.state, "env", None)
    init_services(env)
    if not lead_manager or not lead_manager.supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    payload = {
        "name": req.name,
        "nodes": req.nodes or [],
        "is_active": req.is_active,
    }
    lead_manager.supabase.table("flows").insert(payload).execute()
    return {"status": "created"}


@app.patch("/api/flows/{flow_id}")
async def update_flow(flow_id: str, req: FlowUpdateRequest, request: Request):
    env = getattr(request.state, "env", None)
    init_services(env)
    if not lead_manager or not lead_manager.supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    updates = {}
    if req.name is not None:
        updates["name"] = req.name
    if req.nodes is not None:
        updates["nodes"] = req.nodes
    if req.is_active is not None:
        updates["is_active"] = req.is_active
    if updates:
        lead_manager.supabase.table("flows").update(updates).eq("id", flow_id).execute()
    return {"status": "updated"}

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
                for msg in messages:
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
                        user_text = msg[msg_type].get("caption")
                        media_url = f"https://whatsapp-media-placeholder.com/{media_id}"

                    lead_data = await lead_manager.get_lead(sender_id)
                    if not lead_data:
                        await lead_manager.update_lead(sender_id)
                        lead_data = {"sender_id": sender_id}

                    await lead_manager.save_message(sender_id, user_text, "user", media_url, media_type)

                    booking_type = detect_booking_type(user_text or "")
                    if booking_type:
                        lead_data["flow_state"] = "awaiting_booking_email"
                        lead_data["flow_context"] = {"booking_type": booking_type}
                        await lead_manager.update_lead(
                            sender_id,
                            flow_state="awaiting_booking_email",
                            flow_context={"booking_type": booking_type},
                            status="Booking Requested",
                        )
                        response_text = "Perfect. Please share your email so I can book your " + booking_type + "."
                        await lead_manager.save_message(sender_id, response_text, "assistant")
                        await send_whatsapp_message(sender_id, response_text, env=env)
                        continue

                    if lead_data.get("flow_state") == "awaiting_booking_email":
                        email = extract_email(user_text or "")
                        if not email:
                            response_text = "Please share a valid email address so I can complete the booking."
                            await lead_manager.save_message(sender_id, response_text, "assistant")
                            await send_whatsapp_message(sender_id, response_text, env=env)
                            continue

                        booking_type = (lead_data.get("flow_context") or {}).get("booking_type", "call")
                        booking, booking_error = await try_create_cal_booking(sender_id, email, booking_type)
                        if booking_error:
                            response_text = "I captured your request, but booking config is incomplete. Please contact support."
                        elif booking and booking.get("status") != "error":
                            response_text = "Done. Your " + booking_type + " has been booked. We will share details shortly."
                            await lead_manager.update_lead(sender_id, status="Booked", flow_state="", flow_context={})
                        else:
                            response_text = "I couldn't finalize booking automatically. Please try again in a moment."

                        await lead_manager.save_message(sender_id, response_text, "assistant")
                        await send_whatsapp_message(sender_id, response_text, env=env)
                        continue

                    response_text = await flow_engine.process_message(sender_id, user_text, lead_data)
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
