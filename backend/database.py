import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

class LeadManager:
    def __init__(self, url=None, key=None):
        self.url = url or os.getenv("SUPABASE_URL")
        self.key = key or os.getenv("SUPABASE_KEY")
        
        if self.url and self.key:
            self.supabase: Client = create_client(self.url, self.key)
        else:
            self.supabase = None
            print("Supabase credentials not found. Lead tracking disabled.")

    async def save_message(self, sender_id: str, message: str = None, role: str = "user", media_url: str = None, media_type: str = "text", metadata: dict = None, latency: float = None, cost: float = None, sentiment: float = None):
        if not self.supabase:
            return
        
        data = {
            "sender_id": sender_id,
            "message": message,
            "role": role,
            "media_url": media_url,
            "media_type": media_type,
            "latency": latency,
            "cost": cost,
            "sentiment": sentiment,
            "metadata": metadata or {}
        }
        try:
            self.supabase.table("chat_history").insert(data).execute()
        except Exception as e:
            print(f"Error saving message: {e}")

    async def update_lead(
        self,
        sender_id: str,
        name: str = None,
        intent: str = None,
        area: str = None,
        flow_state: str = None,
        flow_context: dict = None,
        status: str = None,
        ai_enabled: bool = None,
        health_score: float = None,
        total_cost: float = None,
        preferences: str = None,
        language_preference: str = None,
        failed_intents_count: int = None,
    ):
        if not self.supabase:
            return

        data = {"sender_id": sender_id}
        if name is not None: data["name"] = name
        if intent is not None: data["intent"] = intent
        if area is not None: data["area"] = area
        if flow_state is not None: data["flow_state"] = flow_state
        if flow_context is not None: data["flow_context"] = flow_context
        if status is not None: data["status"] = status
        if ai_enabled is not None: data["ai_enabled"] = ai_enabled
        if health_score is not None: data["health_score"] = health_score
        if total_cost is not None: data["total_cost"] = total_cost
        if preferences is not None: data["preferences"] = preferences
        if language_preference is not None: data["language_preference"] = language_preference
        if failed_intents_count is not None: data["failed_intents_count"] = failed_intents_count

        data["last_seen"] = "now()"

        try:
            self.supabase.table("leads").upsert(data, on_conflict="sender_id").execute()
        except Exception as e:
            print(f"Error updating lead: {e}")

    async def get_settings(self):
        if not self.supabase:
            return None
        try:
            response = self.supabase.table("settings").select("*").eq("id", "default").single().execute()
            return response.data
        except Exception as e:
            print(f"Error fetching settings: {e}")
            return None

    async def update_settings(self, provider: str, model: str):
        if not self.supabase:
            return
        data = {"id": "default", "provider": provider, "model": model, "updated_at": "now()"}
        try:
            self.supabase.table("settings").upsert(data).execute()
        except Exception as e:
            print(f"Error updating settings: {e}")

    async def log_event(self, level: str, message: str, metadata: dict = None):
        print(f"[{level}] {message} {metadata or ''}")
        if not self.supabase:
            return
        data = {"level": level, "message": message, "metadata": metadata or {}}
        try:
            self.supabase.table("system_logs").insert(data).execute()
        except Exception as e:
            print(f"Error saving log to Supabase: {e}")

    async def get_chat_history(self, sender_id: str, limit: int = 50):
        if not self.supabase:
            return []
        
        try:
            response = self.supabase.table("chat_history") \
                .select("*") \
                .eq("sender_id", sender_id) \
                .order("created_at", { "ascending": True }) \
                .limit(limit) \
                .execute()
            return response.data
        except Exception as e:
            print(f"Error fetching chat history: {e}")
            return []

    async def get_lead(self, sender_id: str):
        if not self.supabase:
            return None
        
        try:
            response = self.supabase.table("leads") \
                .select("*") \
                .eq("sender_id", sender_id) \
                .single() \
                .execute()
            return response.data
        except Exception as e:
            print(f"Error fetching lead: {e}")
            return None
