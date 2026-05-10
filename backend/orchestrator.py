import os
from groq import Groq
from openai import OpenAI
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

class AIOrchestrator:
    def __init__(self, api_key=None, provider=None):
        self.provider = provider or os.getenv("AI_PROVIDER", "groq")
        self.model = os.getenv("AI_MODEL")
        
        # Initialize clients based on provider
        if self.provider == "groq":
            self.client = Groq(api_key=api_key or os.getenv("GROQ_API_KEY"))
            self.model = self.model or "llama-3.3-70b-versatile"
        elif self.provider == "openai":
            self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
            self.model = self.model or "gpt-4o"
        elif self.provider == "anthropic":
            self.client = Anthropic(api_key=api_key or os.getenv("ANTHROPIC_API_KEY"))
            self.model = self.model or "claude-3-5-sonnet-20240620"
        elif self.provider == "openrouter":
            self.client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key or os.getenv("OPENROUTER_API_KEY"),
            )
            self.model = self.model or "openai/gpt-4o"
        else:
            raise ValueError(f"Unsupported AI provider: {self.provider}")

    def _build_system_prompt(self, lead_data=None, sentiment_context="", previous_messages_count=0):
        """Build context-aware system prompt"""
        base_prompt = """You are Reem, a professional Real Estate Concierge for a leading firm in Qatar. 
Your goal is to assist clients in finding luxury properties in Doha, Lusail, and beyond.

CONVERSATION RULES:
- Always respond in the language the user used (Arabic or English).
- Be polite, professional, and use "Qatari hospitality" tones.
- NEVER start responses with greetings if you've already greeted this user. Just continue naturally.
- Use prior conversation context to avoid asking questions already answered.
- Keep responses concise (2-3 sentences for follow-ups, max 4-5 for detailed answers).
- Reference specific details the user mentioned to show you're listening.
- Don't repeat information they've already shared.

EXPERTISE:
- Premium areas: The Pearl-Qatar, Lusail City (Fox Hills, Marina District), West Bay, Msheireb Downtown, Al Waab.
- Property types: Luxury Apartments, Villas, Townhouses, Commercial Offices.
- Budget-conscious: Can discuss ROI and market trends.
- Bilingual: Support Arabic (Qatari dialect) and English fluently.

CONVERSION GOALS (In Priority Order):
1. Understand their intent (Buying, Renting, Selling, Investment).
2. Identify their requirements (Location, Budget, Type, Timeline).
3. If interested: Immediately offer to schedule a call with a specialist.
4. If exploring: Provide specific property recommendations and next steps.
5. Always end interactions by confirming how to proceed (call/message/email).

INTERACTION STYLE:
- Ask one question at a time, not multiple.
- Listen more than you talk.
- Anticipate needs based on what they've shared.
- Be proactive about solutions, not reactive.
- If they mention frustration: Acknowledge it and offer direct human support.
"""
        
        # Add dynamic progress info
        if previous_messages_count > 0:
            base_prompt += f"\nUSER ENGAGEMENT: This is message #{previous_messages_count + 1} in the conversation. "
            if previous_messages_count > 5:
                base_prompt += "Deepen engagement by referencing specifics from earlier in the conversation."
        
        # KEY FIX: Inject structured lead data to prevent repetitive questions
        if lead_data:
            base_prompt += "\n\nWHAT WE ALREADY KNOW ABOUT THIS USER (DO NOT ASK AGAIN):"
            if lead_data.get("name"):
                base_prompt += f"\n- Name: {lead_data['name']}"
            if lead_data.get("intent"):
                base_prompt += f"\n- Intent: {lead_data['intent']} (User already said they want to {lead_data['intent']})"
            if lead_data.get("area"):
                base_prompt += f"\n- Preferred Area: {lead_data['area']}"
            if lead_data.get("status"):
                base_prompt += f"\n- Current Status: {lead_data['status']}"
            
            context = lead_data.get("flow_context") or {}
            if context.get("budget"):
                base_prompt += f"\n- Budget: {context['budget']}"
            if context.get("timeline"):
                base_prompt += f"\n- Timeline: {context['timeline']}"
            if context.get("bedrooms"):
                base_prompt += f"\n- Bedrooms: {context['bedrooms']}"
        
        if sentiment_context:
            base_prompt += f"\n\nSENTIMENT CONTEXT: {sentiment_context}"
        
        return base_prompt

    async def get_response(self, user_message: str, chat_history: list = None, 
                          lead_data: dict = None, sentiment_context: str = "", 
                          sender_id: str = None):
        """
        Generate contextual, memory-aware response
        """
        
        messages_count = len(chat_history) if chat_history else 0
        system_prompt = self._build_system_prompt(
            lead_data=lead_data,
            sentiment_context=sentiment_context,
            previous_messages_count=messages_count
        )
        
        # Prepare messages in standard format
        messages = []
        if chat_history:
            # Include last 10 messages for context (keeps it focused)
            recent_history = chat_history[-10:] if len(chat_history) > 10 else chat_history
            for msg in recent_history:
                role = "assistant" if msg["role"] == "assistant" else "user"
                content = msg["message"] or ""
                if content:
                    messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": user_message})
        
        try:
            if self.provider == "anthropic":
                completion = self.client.messages.create(
                    model=self.model,
                    max_tokens=1024,
                    system=system_prompt,
                    messages=messages,
                    temperature=0.7,
                )
                response = completion.content[0].text
            else:
                # OpenAI, Groq, and OpenRouter use the same chat completion format
                completion = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "system", "content": system_prompt}] + messages,
                    temperature=0.7,
                    max_tokens=512,
                )
                response = completion.choices[0].message.content
            
            # Clean unwanted greetings for mid-conversation messages
            response = self._clean_greeting(response, messages_count)
            return response
            
        except Exception as e:
            print(f"Error calling {self.provider}: {e}")
            return "I apologize, but I'm having trouble processing your request. Let me connect you with a specialist."

    def _clean_greeting(self, response: str, message_count: int) -> str:
        """Remove unnecessary greetings from response if not the first message"""
        if message_count == 0:
            return response
        
        greetings = [
            "^(Marhaba|Hello|Hi|Assalam|السلام)[^a-zA-Z]*",
            "^(Thank you for|Thanks for)[^a-zA-Z]*",
            "^(Sure|Of course)[,!.]*\s+",
        ]
        
        import re
        for greeting_pattern in greetings:
            response = re.sub(greeting_pattern, "", response, flags=re.IGNORECASE | re.MULTILINE)
        
        return response.strip() or "How else can I help you today?"
