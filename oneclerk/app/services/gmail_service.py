import base64
from email.mime.text import MIMEText
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.config import settings

async def get_gmail_service(user_google_tokens: dict):
    creds = Credentials(
        token=user_google_tokens.get("access_token"),
        refresh_token=user_google_tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET
    )
    return build('gmail', 'v1', credentials=creds)

async def send_confirmation_email( 
    user_google_tokens: dict, 
    to_email: str, 
    subject: str, 
    html_body: str 
) -> bool:
    service = await get_gmail_service(user_google_tokens)
    
    message = MIMEText(html_body, 'html')
    message['to'] = to_email
    message['subject'] = subject
    
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    
    try:
        service.users().messages().send(userId='me', body={'raw': raw}).execute()
        return True
    except Exception:
        return False
 
async def send_appointment_email( 
    user_google_tokens: dict, 
    to_email: str, 
    appointment_details: dict 
) -> bool:
    subject = "Appointment Confirmation - OneClerk"
    html_body = f"<h1>Appointment Confirmed!</h1><p>Details: {appointment_details}</p>"
    return await send_confirmation_email(user_google_tokens, to_email, subject, html_body)
