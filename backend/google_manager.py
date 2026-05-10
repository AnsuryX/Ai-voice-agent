import os
import json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from datetime import datetime

# If modifying these scopes, delete the file token.json.
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar'
]

class GoogleWorkspaceManager:
    def __init__(self):
        self.creds = None
        self.token_path = 'token.json'
        self.client_config = {
            "web": {
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "project_id": os.getenv("GOOGLE_PROJECT_ID"),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                "redirect_uris": [
                    "https://automate.solargear.co.ke/rest/oauth2-credential/callback",
                    "https://frontend-five-topaz-65.vercel.app/"
                ]
            }
        }
        self._authenticate()

    def _authenticate(self):
        if os.path.exists(self.token_path):
            self.creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
        
        # If there are no (valid) credentials available, let the user log in.
        # Note: In a production web app, this flow would be handled via redirect URIs.
        # For this setup, we'll try to refresh if possible.
        if not self.creds or not self.creds.valid:
            if self.creds and self.creds.expired and self.creds.refresh_token:
                self.creds.refresh(Request())
            else:
                # This part is interactive and might fail in headless environments
                # We'll need the token.json to be provided or generated once.
                print("Warning: Google Credentials not found or invalid. Manual auth required.")

    async def backup_lead_to_sheets(self, spreadsheet_id, lead_data):
        """Backup lead information to Google Sheets"""
        if not self.creds:
            return False
            
        try:
            service = build('sheets', 'v4', credentials=self.creds)
            sheet = service.spreadsheets()
            
            values = [[
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                lead_data.get('sender_id', ''),
                lead_data.get('name', ''),
                lead_data.get('intent', ''),
                lead_data.get('area', ''),
                lead_data.get('status', ''),
                json.dumps(lead_data.get('flow_context', {}))
            ]]
            
            body = {'values': values}
            result = sheet.values().append(
                spreadsheetId=spreadsheet_id,
                range="A1",
                valueInputOption="USER_ENTERED",
                body=body
            ).execute()
            
            return True
        except Exception as e:
            print(f"Error backing up to Google Sheets: {e}")
            return False

    async def schedule_calendar_event(self, calendar_id, summary, start_time, end_time, attendee_email):
        """Schedule a meeting on Google Calendar"""
        if not self.creds:
            return False
            
        try:
            service = build('calendar', 'v3', credentials=self.creds)
            
            event = {
                'summary': summary,
                'location': 'WhatsApp / Phone Call',
                'description': 'Real Estate Consultation with Reem AI',
                'start': {
                    'dateTime': start_time,
                    'timeZone': 'Asia/Qatar',
                },
                'end': {
                    'dateTime': end_time,
                    'timeZone': 'Asia/Qatar',
                },
                'attendees': [
                    {'email': attendee_email},
                ],
                'reminders': {
                    'useDefault': True,
                },
            }
            
            event = service.events().insert(calendarId=calendar_id, body=event).execute()
            return event.get('htmlLink')
        except Exception as e:
            print(f"Error scheduling Google Calendar event: {e}")
            return False
