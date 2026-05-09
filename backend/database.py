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

    async def save_message(self, sender_id: str, message: str = None, role: str = "user", media_url: str = None, media_type: str = "text", metadata: dict = None):
        if not self.supabase:
            return
        
        data = {
            "sender_id": sender_id,
            "message": message,
            "role": role,
            "media_url": media_url,
            "media_type": media_type,
            "metadata": metadata or {}
        }
        try:
            self.supabase.table("chat_history").insert(data).execute()
        except Exception as e:
            print(f"Error saving message: {e}")

    async def update_lead(self, sender_id: str, name: str = None, intent: str = None, flow_state: str = None, flow_context: dict = None, status: str = None):
        if not self.supabase:
            return

        data = {"sender_id": sender_id}
        if name: data["name"] = name
        if intent: data["intent"] = intent
        if flow_state: data["flow_state"] = flow_state
        if flow_context: data["flow_context"] = flow_context
        if status: data["status"] = status

        try:
            self.supabase.table("leads").upsert(data, on_conflict="sender_id").execute()
        except Exception as e:
            print(f"Error updating lead: {e}")

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
