from typing import List, Dict, Optional
from google.oauth2.credentials import Credentials 
from googleapiclient.discovery import build 
from app.config import settings

async def get_calendar_service(user_google_tokens: dict):
    creds = Credentials(
        token=user_google_tokens.get("access_token"),
        refresh_token=user_google_tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET
    )
    return build('calendar', 'v3', credentials=creds)

async def create_appointment( 
    user_google_tokens: dict, 
    title: str, 
    start_datetime: str, 
    end_datetime: str, 
    description: str, 
    attendee_email: str = None 
) -> dict: 
    service = await get_calendar_service(user_google_tokens)
    
    event = {
        'summary': title,
        'description': description,
        'start': {
            'dateTime': start_datetime,
            'timeZone': 'UTC',
        },
        'end': {
            'dateTime': end_datetime,
            'timeZone': 'UTC',
        },
        'reminders': {
            'useDefault': False,
            'overrides': [
                {'method': 'email', 'minutes': 24 * 60},
                {'method': 'popup', 'minutes': 60},
            ],
        },
    }
    
    if attendee_email:
        event['attendees'] = [{'email': attendee_email}]

    created_event = service.events().insert(calendarId='primary', body=event).execute()
    return {
        "event_id": created_event.get("id"),
        "html_link": created_event.get("htmlLink"),
        "summary": created_event.get("summary")
    }
 
async def get_availability( 
    user_google_tokens: dict, 
    date: str, 
    duration_minutes: int = 30 
) -> list[str]: 
    service = await get_calendar_service(user_google_tokens)
    
    # This is a simplified version. In production, you'd use freebusy query.
    # For now, let's return some mock slots or implement basic freebusy.
    return ["09:00", "10:00", "11:00", "14:00", "15:00"]
 
async def get_upcoming_appointments( 
    user_google_tokens: dict, 
    days_ahead: int = 7 
) -> list[dict]: 
    service = await get_calendar_service(user_google_tokens)
    # Implement listing events for the next 7 days
    return []
