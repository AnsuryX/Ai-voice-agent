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

    async def save_message(self, sender_id: str, message: str, role: str):
        if not self.supabase:
            return
        
        data = {
            "sender_id": sender_id,
            "message": message,
            "role": role
        }
        try:
            self.supabase.table("chat_history").insert(data).execute()
        except Exception as e:
            print(f"Error saving message: {e}")

    async def update_lead(self, sender_id: str, name: str = None, intent: str = None):
        if not self.supabase:
            return

        data = {"sender_id": sender_id}
        if name: data["name"] = name
        if intent: data["intent"] = intent

        try:
            self.supabase.table("leads").upsert(data, on_conflict="sender_id").execute()
        except Exception as e:
            print(f"Error updating lead: {e}")
