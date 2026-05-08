import os
import httpx
from dotenv import load_dotenv

load_dotenv()

class BookingManager:
    def __init__(self):
        self.api_key = os.getenv("CAL_API_KEY")
        self.base_url = "https://api.cal.com/v1"

    async def get_available_slots(self, event_type_id: int):
        """
        Fetches available slots for a specific event type.
        """
        if not self.api_key:
            return "Booking system is currently offline."
        
        url = f"{self.base_url}/availability"
        params = {"apiKey": self.api_key, "eventTypeId": event_type_id}
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, params=params)
                # Parse and return simplified slots for the bot to display
                return response.json()
            except Exception as e:
                print(f"Error fetching slots: {e}")
                return []

    async def create_booking(self, attendee_email: str, start_time: str, event_type_id: int):
        """
        Creates a new booking in Cal.com.
        """
        if not self.api_key:
            return None
            
        url = f"{self.base_url}/bookings"
        payload = {
            "eventTypeId": event_type_id,
            "start": start_time,
            "responses": {
                "email": attendee_email,
                "name": "WhatsApp Lead"
            },
            "timeZone": "Asia/Qatar"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, params={"apiKey": self.api_key}, json=payload)
                return response.json()
            except Exception as e:
                print(f"Error creating booking: {e}")
                return None
