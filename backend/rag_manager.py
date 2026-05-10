import os
import json
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

class RAGManager:
    def __init__(self, supabase_client: Client = None):
        self.supabase = supabase_client
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        if not self.supabase:
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_KEY")
            if url and key:
                self.supabase = create_client(url, key)

    async def get_embedding(self, text: str):
        """Generate embedding using OpenAI"""
        try:
            response = self.openai_client.embeddings.create(
                input=text,
                model="text-embedding-3-small"
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return None

    async def search_properties(self, query: str, limit: int = 3, threshold: float = 0.5):
        """Search properties using vector similarity"""
        if not self.supabase:
            return []

        embedding = await self.get_embedding(query)
        if not embedding:
            return []

        try:
            # Use the RPC function we created in migration
            result = self.supabase.rpc(
                "match_properties",
                {
                    "query_embedding": embedding,
                    "match_threshold": threshold,
                    "match_count": limit,
                }
            ).execute()
            
            return result.data or []
        except Exception as e:
            print(f"Error searching properties: {e}")
            return []

    def format_properties_for_prompt(self, properties: list):
        """Format property list into a string for the AI prompt"""
        if not properties:
            return "No specific property matches found in our database at the moment."
        
        formatted = "RECOMMENDED PROPERTIES:\n"
        for i, p in enumerate(properties, 1):
            formatted += f"{i}. {p['title']} in {p['area'] or p['location']}\n"
            formatted += f"   - Price: {p['price']} QAR\n"
            formatted += f"   - Details: {p['bedrooms']} BR, {p['type']}\n"
            formatted += f"   - Description: {p['description'][:100]}...\n\n"
        
        return formatted
