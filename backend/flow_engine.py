import json

class FlowEngine:
    def __init__(self, lead_manager):
        self.lead_manager = lead_manager

    async def process_message(self, sender_id, user_text, lead_data):
        flow_state = lead_data.get("flow_state")
        flow_context = lead_data.get("flow_context") or {}

        if not flow_state:
            return None # Not in a flow

        # Example hardcoded flow: Booking
        if flow_state == "awaiting_area":
            flow_context["area"] = user_text
            new_state = "awaiting_budget"
            response = "Great! What is your budget range for a property in " + user_text + "?"
            await self.lead_manager.update_lead(
                sender_id,
                area=user_text,
                flow_state=new_state,
                flow_context=flow_context,
            )
            return response

        if flow_state == "awaiting_budget":
            flow_context["budget"] = user_text
            new_state = "completed"
            response = "Thank you. One of our specialists will contact you soon regarding properties within " + user_text + " in " + flow_context.get("area") + "."
            await self.lead_manager.update_lead(
                sender_id,
                flow_state="",
                flow_context=flow_context,
                status="Qualified",
            )
            return response

        return None
