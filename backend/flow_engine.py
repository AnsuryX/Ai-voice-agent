import json

class FlowEngine:
    def __init__(self, lead_manager):
        self.lead_manager = lead_manager

    async def process_message(self, sender_id, user_text, lead_data):
        """Process message through qualification flow"""
        flow_state = lead_data.get("flow_state")
        flow_context = lead_data.get("flow_context") or {}

        if not flow_state:
            return None  # Not in a flow

        # Qualification flow states
        if flow_state == "awaiting_intent":
            # Asking what they want (buy/rent/sell)
            intent = self._extract_intent(user_text)
            if intent:
                flow_context["intent"] = intent
                new_state = "awaiting_area"
                response = f"Perfect! I see you're interested in {intent}. Which area in Qatar interests you most? The Pearl, Lusail, West Bay, or elsewhere?"
                await self.lead_manager.update_lead(
                    sender_id,
                    intent=intent,
                    flow_state=new_state,
                    flow_context=flow_context,
                )
                return response
            else:
                return "I understand you're interested in properties. Are you looking to buy, rent, or sell?"

        if flow_state == "awaiting_area":
            # Asking for area preference
            area = user_text.strip()
            flow_context["area"] = area
            new_state = "awaiting_budget"
            response = f"Great choice! {area} has some excellent options. What's your budget range for a property?"
            await self.lead_manager.update_lead(
                sender_id,
                area=area,
                flow_state=new_state,
                flow_context=flow_context,
            )
            return response

        if flow_state == "awaiting_budget":
            # Asking for budget
            budget = user_text.strip()
            flow_context["budget"] = budget
            
            # Check qualification - move to booking if qualified
            response = self._generate_next_step_response(area=flow_context.get("area"), budget=budget)
            
            await self.lead_manager.update_lead(
                sender_id,
                flow_state="ready_for_booking",
                flow_context=flow_context,
                status="Qualified Lead",
            )
            return response

        if flow_state == "awaiting_booking_email":
            # Extract email and create booking
            email = self._extract_email(user_text)
            if email:
                flow_context["email"] = email
                await self.lead_manager.update_lead(
                    sender_id,
                    flow_state="booking_scheduled",
                    flow_context=flow_context,
                    status="Awaiting Specialist",
                )
                return "Excellent! I've captured your details. A specialist will contact you shortly to discuss properties matching your requirements."
            else:
                return "Could you please share your email address so I can arrange a specialist to reach out?"

        return None

    def _extract_intent(self, text: str) -> str:
        """Extract intent from user message"""
        text_lower = text.lower()
        if any(word in text_lower for word in ["buy", "buying", "purchase", "invest"]):
            return "buy"
        elif any(word in text_lower for word in ["rent", "renting", "lease"]):
            return "rent"
        elif any(word in text_lower for word in ["sell", "selling", "sale"]):
            return "sell"
        return None

    def _extract_email(self, text: str) -> str:
        """Extract email from user message"""
        import re
        match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
        return match.group(0) if match else None

    def _generate_next_step_response(self, area: str, budget: str) -> str:
        """Generate contextual response based on collected info"""
        responses = [
            f"Perfect! We have several luxury properties in {area} within your budget. A specialist will contact you shortly to show you the best options.",
            f"Excellent choice! {area} is a prime location. Let me connect you with our specialist who can present curated options for you.",
            f"Great! Based on your budget and preference for {area}, I have some properties that would be perfect for you. Our team will be in touch within the hour.",
        ]
        
        import random
        return random.choice(responses)
