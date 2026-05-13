import os
import json
import httpx
import time
import re
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Request, Response, HTTPException, UploadFile, File, Form
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
from sentiment_analyzer import SentimentAnalyzer
from booking import BookingManager
from rag_manager import RAGManager
from google_manager import GoogleWorkspaceManager
from sentiment_analyzer import SentimentAnalyzer
from lead_qualifier import LeadQualifier
from pydantic import BaseModel
from typing import Optional

# Global services
orchestrator = None
lead_manager = None
flow_engine = None
booking_manager = None
rag_manager = None
google_manager = None
sentiment_analyzer = None
lead_qualifier = None

class MessageRequest(BaseModel):
    recipient_number: str
    message_text: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = "text"
    template_name: Optional[str] = None
    language_code: Optional[str] = "en_US"
    components: Optional[list] = None


class SettingsRequest(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    openai_key: Optional[str] = None
    anthropic_key: Optional[str] = None
    google_sheets_id: Optional[str] = None


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
    ai_enabled: Optional[bool] = None
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


class PropertyCreateRequest(BaseModel):
    title: str
    area: Optional[str] = None
    price: Optional[float] = None
    description: Optional[str] = None
    bedrooms: Optional[int] = None
    type: Optional[str] = None
    images: Optional[list[str]] = None


DEFAULT_FLOWS = [
    {
        "name": "Property Qualification Flow",
        "nodes": [
            {"type": "question", "key": "intent", "text": "Are you looking to buy, rent, or sell?"},
            {"type": "question", "key": "area", "text": "Which area in Qatar are you interested in?"},
            {"type": "question", "key": "budget", "text": "What budget range are you considering?"},
        ],
        "is_active": True,
    },
    {
        "name": "Call Booking Flow",
        "nodes": [
            {"type": "intent", "match": "call"},
            {"type": "question", "key": "email", "text": "Please share your email to schedule your call."},
        ],
        "is_active": True,
    },
    {
        "name": "Visit Booking Flow",
        "nodes": [
            {"type": "intent", "match": "visit"},
            {"type": "question", "key": "email", "text": "Please share your email to schedule your property visit."},
        ],
        "is_active": True,
    },
]
RUNTIME_FLOWS: list[dict] = []

def get_config(key, env=None):
    if env and hasattr(env, key):
        return getattr(env, key)
    return os.getenv(key)

async def init_services(env=None):
    global orchestrator, lead_manager, flow_engine, booking_manager, rag_manager, google_manager, sentiment_analyzer, lead_qualifier
    if lead_manager is None:
        lead_manager = LeadManager(
            url=get_config("SUPABASE_URL", env),
            key=get_config("SUPABASE_KEY", env)
        )

    if orchestrator is None:
        orchestrator = AIOrchestrator(api_key=get_config("GROQ_API_KEY", env))
        if lead_manager and lead_manager.supabase:
            settings = await lead_manager.get_settings()
            if settings:
                orchestrator.provider = settings.get("provider", orchestrator.provider)
                orchestrator.model = settings.get("model", orchestrator.model)
    if flow_engine is None:
        flow_engine = FlowEngine(lead_manager)
    if booking_manager is None:
        booking_manager = BookingManager()
    if rag_manager is None:
        rag_manager = RAGManager(lead_manager.supabase if lead_manager else None)
    if google_manager is None:
        try:
            google_manager = GoogleWorkspaceManager()
        except Exception as e:
            print(f"Warning: Failed to initialize Google Manager: {e}")
    if sentiment_analyzer is None:
        sentiment_analyzer = SentimentAnalyzer()
    if lead_qualifier is None:
        lead_qualifier = LeadQualifier()

@app.get("/api/keep-alive")
async def keep_alive(request: Request):
    """Keep Supabase and the service active"""
    env = getattr(request.state, "env", None)
    await init_services(env)
    if lead_manager and lead_manager.supabase:
        # Simple query to keep Supabase active
        lead_manager.supabase.table("leads").select("count", count="exact").limit(1).execute()
    return {"status": "alive", "timestamp": datetime.now().isoformat()}

@app.get("/api/settings")
async def get_settings(request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    settings = await lead_manager.get_settings()
    if settings:
        return settings
    return {"provider": orchestrator.provider, "model": orchestrator.model}

@app.post("/api/settings")
async def update_settings(req: SettingsRequest, request: Request):
    """Update agent settings dynamically"""
    env = getattr(request.state, "env", None)
    await init_services(env)

    provider = req.provider or orchestrator.provider
    model = req.model or orchestrator.model
    
    orchestrator.provider = provider
    orchestrator.model = model

    if lead_manager:
        await lead_manager.update_settings(provider, model)
        await lead_manager.log_event("INFO", f"AI Settings updated: {provider} - {model}")

    return {"status": "updated", "current_provider": provider, "current_model": model}


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


async def try_create_cal_booking(email: str, booking_type: str):
    event_key = "CAL_CALL_EVENT_TYPE_ID" if booking_type == "call" else "CAL_VISIT_EVENT_TYPE_ID"
    event_type_id = os.getenv(event_key) or os.getenv("CAL_DEFAULT_EVENT_TYPE_ID")
    if not event_type_id:
        return None, f"Missing {event_key}"

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
    media_id: str = None,
    document_filename: str = None,
    template_name: str = None,
    language_code: str = "en_US",
    components: list = None,
    env=None
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

    if template_name:
        payload["type"] = "template"
        payload["template"] = {
            "name": template_name,
            "language": {"code": language_code}
        }
        if components:
            payload["template"]["components"] = components
    elif media_id:
        send_type = media_type if media_type in ["image", "video", "audio", "document"] else "document"
        payload["type"] = send_type
        payload[send_type] = {"id": media_id}
        if message_text and send_type in ["image", "video", "document"]:
            payload[send_type]["caption"] = message_text
        if send_type == "document" and document_filename:
            payload[send_type]["filename"] = document_filename
    elif media_type == "text" or not media_url:
        payload["type"] = "text"
        payload["text"] = {"body": message_text}
    else:
        payload["type"] = media_type
        payload[media_type] = {"link": media_url}
        if message_text and media_type in ["image", "video"]:
            payload[media_type]["caption"] = message_text

    async with httpx.AsyncClient() as client:
        await client.post(url, headers=headers, json=payload)


def detect_media_type(file: UploadFile, requested_type: str = None):
    if requested_type in ["image", "video", "audio", "document"]:
        return requested_type

    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()

    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("video/"):
        return "video"
    if content_type.startswith("audio/"):
        return "audio"
    if content_type.startswith("application/") or filename.endswith((".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt")):
        return "document"
    return "document"


async def upload_whatsapp_media(file: UploadFile, env=None):
    phone_id = get_config("WHATSAPP_PHONE_ID", env)
    token = get_config("WHATSAPP_TOKEN", env)
    if not phone_id or not token:
        raise HTTPException(status_code=500, detail="WhatsApp credentials missing")

    upload_url = f"https://graph.facebook.com/v21.0/{phone_id}/media"
    headers = {
        "Authorization": f"Bearer {token}",
    }

    file_bytes = await file.read()
    files = {
        "file": (
            file.filename or "upload.bin",
            file_bytes,
            file.content_type or "application/octet-stream",
        )
    }
    data = {
        "messaging_product": "whatsapp",
        "type": file.content_type or "application/octet-stream",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(upload_url, headers=headers, data=data, files=files)
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        payload = response.json()

    media_id = payload.get("id")
    if not media_id:
        raise HTTPException(status_code=500, detail="Media upload failed")
    return media_id

@app.get("/debug")
async def debug(request: Request):
    return {
        "path": request.url.path,
        "method": request.method,
        "env_vars": list(os.environ.keys()),
        "status": "active"
    }

@app.get("/")
async def root(request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)

    db_status = "Disconnected"
    try:
        if lead_manager and lead_manager.supabase:
            lead_manager.supabase.table("leads").select("count", count="exact").limit(1).execute()
            db_status = "Connected"
    except Exception:
        db_status = "Error"

    ai_status = "Unknown"
    try:
        if orchestrator:
            # Simple check if client is initialized
            if orchestrator.client:
                ai_status = f"Ready ({orchestrator.provider})"
    except Exception:
        ai_status = "Error"

    return {
        "status": "online" if db_status == "Connected" else "degraded",
        "database": db_status,
        "ai_agent": ai_status,
        "provider": orchestrator.provider if orchestrator else None,
        "model": orchestrator.model if orchestrator else None,
        "timestamp": datetime.now().isoformat(),
        "message": "Qatar Real Estate WhatsApp Bot API"
    }

@app.post("/api/send-message")
async def manual_send_message(req: MessageRequest, request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    
    try:
        await send_whatsapp_message(
            recipient_number=req.recipient_number,
            message_text=req.message_text,
            media_url=req.media_url,
            media_type=req.media_type,
            template_name=req.template_name,
            language_code=req.language_code,
            components=req.components,
            env=env
        )
    except Exception as e:
        print(f"Warning: Failed to send WhatsApp message: {e}")
    
    log_text = req.message_text or f"[Template: {req.template_name}]"
    if lead_manager:
        await lead_manager.save_message(
            sender_id=req.recipient_number,
            message=log_text,
            role="assistant",
            media_url=req.media_url,
            media_type=req.media_type,
            metadata={"template": req.template_name} if req.template_name else {}
        )
    
    return {"status": "sent"}


@app.post("/api/send-media")
async def manual_send_media(
    request: Request,
    recipient_number: str = Form(...),
    file: UploadFile = File(...),
    caption: str = Form(None),
    media_type: str = Form(None),
):
    env = getattr(request.state, "env", None)
    await init_services(env)

    resolved_type = detect_media_type(file, media_type)
    media_id = await upload_whatsapp_media(file, env=env)

    await send_whatsapp_message(
        recipient_number=recipient_number,
        message_text=caption,
        media_type=resolved_type,
        media_id=media_id,
        document_filename=file.filename,
        env=env,
    )

    if lead_manager:
        await lead_manager.save_message(
            sender_id=recipient_number,
            message=caption,
            role="assistant",
            media_url=None,
            media_type=resolved_type,
            metadata={
                "media_id": media_id,
                "filename": file.filename,
                "content_type": file.content_type,
            },
        )

    return {"status": "sent", "media_type": resolved_type}


@app.get("/api/contacts")
async def list_contacts(request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    if not lead_manager or not lead_manager.supabase:
        return []
    result = lead_manager.supabase.table("leads").select("*").order("created_at", desc=True).execute()
    return result.data or []

@app.get("/api/chat/all")
@app.get("/chat/all")
async def get_all_chat_history(request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    if not lead_manager or not lead_manager.supabase:
        return []
    result = lead_manager.supabase.table("chat_history").select("*").order("created_at", desc=True).limit(200).execute()
    return result.data or []


@app.get("/api/chat/{sender_id}")
@app.get("/chat/{sender_id}")
async def get_chat_history(sender_id: str, request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    if not lead_manager:
        return []
    return await lead_manager.get_chat_history(sender_id)


@app.post("/api/contacts")
async def create_contact(req: ContactRequest, request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    await lead_manager.update_lead(
        sender_id=req.sender_id,
        name=req.name,
        intent=req.intent,
        area=req.area,
        status=req.status,
    )
    await lead_manager.update_lead(sender_id=req.sender_id, flow_context={"notes": "", "tags": [], "assignee": ""})
    return {"status": "created"}


@app.patch("/api/contacts/{sender_id}")
async def update_contact(sender_id: str, req: ContactUpdateRequest, request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
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
        ai_enabled=req.ai_enabled,
        flow_context=context,
    )
    return {"status": "updated"}


@app.post("/api/contacts/bulk")
async def bulk_update_contacts(req: BulkActionRequest, request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
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
    await init_services(env)
    try:
        result = lead_manager.supabase.table("flows").select("*").order("created_at", desc=True).execute()
        if not result.data:
            lead_manager.supabase.table("flows").insert(DEFAULT_FLOWS).execute()
            result = lead_manager.supabase.table("flows").select("*").order("created_at", desc=True).execute()
        return result.data or []
    except Exception:
        return (RUNTIME_FLOWS or DEFAULT_FLOWS)


@app.get("/api/properties")
async def list_properties(request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    if not lead_manager or not lead_manager.supabase:
        return []
    result = lead_manager.supabase.table("properties").select("*").order("created_at", desc=True).execute()
    return result.data or []


@app.post("/api/properties")
async def create_property(req: PropertyCreateRequest, request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    if not lead_manager or not lead_manager.supabase:
        raise HTTPException(status_code=500, detail="Database not available")

    # Generate embedding for RAG
    text_to_embed = f"{req.title} {req.area} {req.description} {req.type}"
    embedding = await rag_manager.get_embedding(text_to_embed)

    data = req.dict()
    data["embedding"] = embedding

    result = lead_manager.supabase.table("properties").insert(data).execute()
    return {"status": "created", "id": result.data[0]["id"] if result.data else None}


@app.delete("/api/properties/{prop_id}")
async def delete_property(prop_id: str, request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    if not lead_manager or not lead_manager.supabase:
        raise HTTPException(status_code=500, detail="Database not available")

    lead_manager.supabase.table("properties").delete().eq("id", prop_id).execute()
    return {"status": "deleted"}


@app.post("/api/flows")
async def create_flow(req: FlowCreateRequest, request: Request):
    env = getattr(request.state, "env", None)
    await init_services(env)
    payload = {
        "id": f"runtime-{len(RUNTIME_FLOWS)+1}",
        "name": req.name,
        "nodes": req.nodes or [],
        "is_active": req.is_active,
    }
    try:
        lead_manager.supabase.table("flows").insert({
            "name": req.name,
            "nodes": req.nodes or [],
            "is_active": req.is_active,
        }).execute()
    except Exception:
        RUNTIME_FLOWS.append(payload)
    return {"status": "created"}

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
    await init_services(env)
    
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
                        # In a real app, we'd use media_id to get the URL from Meta API
                        # For now, we'll store a placeholder or caption
                        user_text = msg[msg_type].get("caption")
                        media_url = f"https://whatsapp-media-placeholder.com/{media_id}"

                    # Get lead data for context
                    lead_data = await lead_manager.get_lead(sender_id)
                    if not lead_data:
                        await lead_manager.update_lead(sender_id)
                        lead_data = {"sender_id": sender_id}

                    # Save incoming message
                    # Sentiment Analysis
                    sentiment_score, sentiment_type, needs_human = 0.0, "neutral", False
                    if user_text:
                        sentiment_score, sentiment_type, needs_human = sentiment_analyzer.analyze(user_text)

                    # Save incoming message
                    await lead_manager.save_message(sender_id, user_text, "user", media_url, media_type, sentiment=sentiment_score)

                    # Initialize response variables
                    response_text = None
                    cost = 0.0
                    latency = 0.0

                    # Escalation Check
                    escalation_keywords = ["manager", "refund", "human", "agent", "supervisor", "complain"]
                    if user_text and any(kw in user_text.lower() for kw in escalation_keywords):
                        await lead_manager.update_lead(sender_id, status="Escalated", ai_enabled=False)
                        await lead_manager.log_event("INFO", f"Lead {sender_id} escalated due to keyword matching.")
                        response_text = "I've notified our management team to assist you directly. A human agent will reach out shortly."
                        await lead_manager.save_message(sender_id, response_text, "assistant")
                        await send_whatsapp_message(sender_id, response_text, env=env)
                        continue

                    # Analyze sentiment
                    sentiment_score, sentiment_type, needs_human = sentiment_analyzer.analyze(user_text or "")
                    
                    # Check if should escalate to human
                    chat_history = await lead_manager.get_chat_history(sender_id)
                    qualification_score = lead_qualifier.calculate_score(lead_data, chat_history)
                    
                    should_escalate = (
                        needs_human or 
                        sentiment_type in ['angry', 'frustrated'] or
                        qualification_score >= 75
                    )
                    
                    if should_escalate and lead_data.get("flow_state") != "human_handoff":
                        print(f"🔴 Escalating {sender_id}: sentiment={sentiment_type}, score={qualification_score}")
                        await lead_manager.update_lead(
                            sender_id,
                            status="Escalated - Awaiting Agent",
                            flow_state="human_handoff",
                            flow_context={**(lead_data.get("flow_context") or {}), "qualification_score": qualification_score}
                        )
                        response_text = "Let me connect you with our specialist team who can better assist you. Please hold on..."
                        await lead_manager.save_message(sender_id, response_text, "assistant")
                        await send_whatsapp_message(sender_id, response_text, env=env)
                        continue

                    booking_type = detect_booking_type(user_text or "")
                    if booking_type:
                        await lead_manager.update_lead(
                            sender_id=sender_id,
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
                        try:
                            booking, booking_error = await try_create_cal_booking(email, booking_type)
                            if booking_error:
                                response_text = "I captured your request, but booking config is incomplete. Please contact support."
                                await lead_manager.log_event("WARNING", f"Booking error for {sender_id}: {booking_error}")
                            elif booking and booking.get("status") != "error":
                                response_text = "Done. Your " + booking_type + " has been booked. We will share details shortly."
                                await lead_manager.update_lead(sender_id, status="Booked", flow_state="", flow_context={})
                                await lead_manager.log_event("INFO", f"Booking confirmed for {sender_id}")
                            else:
                                response_text = "I couldn't finalize booking automatically. Please try again in a moment."
                                await lead_manager.log_event("ERROR", "Booking failed", {"booking_response": booking})
                        except Exception as e:
                            response_text = "An error occurred while booking. Our team will contact you."
                            await lead_manager.log_event("ERROR", f"Booking exception: {str(e)}", {"sender_id": sender_id})

                        await lead_manager.save_message(sender_id, response_text, "assistant")
                        await send_whatsapp_message(sender_id, response_text, env=env)
                        continue

                    # 1. Try Flow Engine
                    response_text = await flow_engine.process_message(sender_id, user_text, lead_data)
                    
                    # 2. If no flow, use AI Orchestrator
                    if not response_text and user_text and lead_data.get("ai_enabled", True):
                        # RAG: Search for relevant properties
                        try:
                            properties = await rag_manager.search_properties(user_text)
                            property_context = rag_manager.format_properties_for_prompt(properties)
                        except Exception as e:
                            await lead_manager.log_event("ERROR", f"RAG Search failed: {str(e)}")
                            property_context = ""

                        chat_history = await lead_manager.get_chat_history(sender_id)
                        start_time = time.time()
                        try:
                            ai_result = await orchestrator.get_response(
                                user_text,
                                chat_history=chat_history,
                                lead_data=lead_data,
                                sentiment_context=property_context
                            )
                        except Exception as e:
                            await lead_manager.log_event("ERROR", f"AI Response failed: {str(e)}")
                            ai_result = "I'm having some technical issues. Please wait a moment."
                        latency = time.time() - start_time
                        if isinstance(ai_result, dict):
                            response_text = ai_result.get("response")
                            cost = ai_result.get("cost", 0.0)
                        else:
                            response_text = ai_result

                    if response_text:
                        # Calculate health score update
                        current_health = lead_data.get("health_score", 1.0)
                        # Agent confusion detection (simple)
                        confusion_keywords = ["apologize", "sorry", "don't understand", "trouble processing"]
                        failed_intents = lead_data.get("failed_intents_count", 0)
                        if response_text and any(kw in response_text.lower() for kw in confusion_keywords):
                            current_health = max(0.0, current_health - 0.2)
                            failed_intents += 1
                            if failed_intents >= 3:
                                await lead_manager.update_lead(sender_id, status="Escalated", ai_enabled=False)
                                await lead_manager.log_event("WARNING", f"Lead {sender_id} escalated due to 3x failed intents.")
                                response_text = "I'm sorry I haven't been able to help as expected. I'm connecting you with a human specialist who can assist better."
                        else:
                            failed_intents = 0 # Reset on success

                        # Adjust by sentiment
                        if sentiment_score < 0:
                            current_health = max(0.0, current_health - 0.1)

                        total_cost = lead_data.get("total_cost", 0.0) + cost

                        await lead_manager.update_lead(
                            sender_id,
                            health_score=current_health,
                            total_cost=total_cost,
                            failed_intents_count=failed_intents
                        )
                        await lead_manager.save_message(sender_id, response_text, "assistant", latency=latency, cost=cost)
                        await send_whatsapp_message(sender_id, response_text, env=env)
                        
                        # Google Sheets Backup
                        sheets_id = get_config("GOOGLE_SHEETS_ID", env)
                        if sheets_id and google_manager:
                            updated_lead = await lead_manager.get_lead(sender_id)
                            await google_manager.backup_lead_to_sheets(sheets_id, updated_lead)

                        
        return {"status": "success"}
    return {"status": "ignored"}

class Default(WorkerEntrypoint):
    async def fetch(self, request, env, ctx):
        # Bridge Cloudflare Worker request to FastAPI
        # We store env in request state so our endpoints can access it
        await init_services(env)
        return await asgi.fetch(app, request, env)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
