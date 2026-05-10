import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

class AIOrchestrator:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=self.api_key)
        self.model = "llama-3.3-70b-versatile"
        # Track which conversations have been greeted
        self.greeted_conversations = set()

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
        
        if previous_messages_count > 0:
            base_prompt += f"\nUSER ENGAGEMENT: This is message #{previous_messages_count + 1} in the conversation. "
            if previous_messages_count > 5:
                base_prompt += "Deepen engagement by referencing specifics from earlier in the conversation."
            elif previous_messages_count >= 3:
                base_prompt += "You have good context. Be specific and help them move toward a decision."
        
        if lead_data:
            base_prompt += "\n\nCONTEXT ABOUT THIS USER:"
            if lead_data.get("name"):
                base_prompt += f"\n- Name: {lead_data['name']}"
            if lead_data.get("intent"):
                base_prompt += f"\n- Interest: {lead_data['intent']}"
            if lead_data.get("area"):
                base_prompt += f"\n- Area preference: {lead_data['area']}"
            if lead_data.get("status"):
                base_prompt += f"\n- Current status: {lead_data['status']}"
            
            context = lead_data.get("flow_context") or {}
            if context.get("budget"):
                base_prompt += f"\n- Budget: {context['budget']}"
            if context.get("timeline"):
                base_prompt += f"\n- Timeline: {context['timeline']}"
        
        if sentiment_context:
            base_prompt += f"\n\n{sentiment_context}"
        
        return base_prompt

    async def get_response(self, user_message: str, chat_history: list = None, 
                          lead_data: dict = None, sentiment_context: str = "", 
                          sender_id: str = None):
        """
        Generate contextual, memory-aware response
        
        Args:
            user_message: The current user message
            chat_history: Previous messages in conversation
            lead_data: Lead information for context
            sentiment_context: Sentiment analysis context
            sender_id: User identifier for greeting tracking
        """
        
        # Build context-aware system prompt
        messages_count = len(chat_history) if chat_history else 0
        system_prompt = self._build_system_prompt(
            lead_data=lead_data,
            sentiment_context=sentiment_context,
            previous_messages_count=messages_count
        )
        
        messages = [{"role": "system", "content": system_prompt}]
        
        if chat_history:
            # Only include last 15 messages for context (to fit token limits)
            recent_history = chat_history[-15:] if len(chat_history) > 15 else chat_history
            
            for msg in recent_history:
                role = "assistant" if msg["role"] == "assistant" else "user"
                content = msg["message"] or "[Media/Attachment]"
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": user_message})
        
        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=512,  # Shorter, more focused responses
                top_p=1,
                stream=False,
            )
            
            response = completion.choices[0].message.content
            
            # Ensure response doesn't start with unnecessary greetings
            response = self._clean_greeting(response, messages_count)
            
            return response
        except Exception as e:
            print(f"Error calling Groq: {e}")
            return "I apologize, but I'm having trouble processing your request right now. Please try again in a moment."

    def _clean_greeting(self, response: str, message_count: int) -> str:
        """Remove unnecessary greetings from response"""
        if message_count == 0:
            # First message - keep greeting
            return response
        
        # Remove common greeting patterns for follow-up messages
        greetings = [
            "^(Marhaba|Hello|Hi|Assalam|السلام)[^a-zA-Z]*",
            "^(Thank you for|Thanks for)[^a-zA-Z]*",
            "^(Sure|Of course)[,!.]*\s+",
        ]
        
        import re
        for greeting_pattern in greetings:
            response = re.sub(greeting_pattern, "", response, flags=re.IGNORECASE | re.MULTILINE)
        
        # Ensure response isn't empty after cleaning
        if response.strip():
            return response.strip()
        
        return "Let me help you with that."
