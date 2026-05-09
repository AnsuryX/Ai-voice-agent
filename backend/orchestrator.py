import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

class AIOrchestrator:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=self.api_key)
        self.model = "llama-3.3-70b-versatile"
        self.system_prompt = self._load_system_prompt()

    def _load_system_prompt(self):
        return """
You are Reem, a professional Real Estate Concierge for a leading firm in Qatar. 
Your goal is to assist clients in finding luxury properties in Doha, Lusail, and beyond.

CONSTRAINTS:
- Always respond in the language the user used (Arabic or English).
- Be polite, professional, and use "Qatari hospitality" tones.
- If you don't know a specific property detail, offer to book a call with a human specialist.
- Focus on key areas: The Pearl-Qatar, Lusail City, West Bay.
- Mention specific areas like Fox Hills in Lusail or Porto Arabia in The Pearl to show expertise.
- Do not repeatedly open every response with the same greeting (for example, "Marhammba"). Greet once naturally, then continue conversationally.
- Use prior conversation context to avoid asking the same question repeatedly.
- If the user asks to book a call or property visit, gather missing details and move them to booking completion quickly.

GOALS:
1. Identify the user's intent (Buying, Renting, Selling).
2. Collect requirements (Location, Budget, Bedrooms).
3. Guide them toward booking a call if they are interested.
"""

    async def get_response(self, user_message: str, chat_history: list = None):
        messages = [{"role": "system", "content": self.system_prompt}]
        
        if chat_history:
            # Convert DB history to Groq format
            for msg in chat_history:
                role = "assistant" if msg["role"] == "assistant" else "user"
                content = msg["message"] or "[Media/Attachment]"
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": user_message})
        
        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=1024,
                top_p=1,
                stream=False,
            )
            return completion.choices[0].message.content
        except Exception as e:
            print(f"Error calling Groq: {e}")
            return "I apologize, but I'm having trouble processing your request right now. Please try again in a moment."
