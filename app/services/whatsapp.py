import httpx
import logging
from app.config import settings

logger = logging.getLogger(__name__)

async def send_whatsapp(to: str, message: str) -> bool:
    """Send a WhatsApp message via Telnyx Messaging API."""
    # Format number to E.164
    if not to.startswith('+'):
        to = f"+{to}"
    
    url = "https://api.telnyx.com/v2/messages"
    headers = {
        "Authorization": f"Bearer {settings.TELNYX_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "from": settings.TELNYX_PHONE_NUMBER,
        "to": to,
        "text": message,
        "messaging_profile_id": settings.TELNYX_MESSAGING_PROFILE_ID
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            if response.status_code >= 400:
                logger.error(f"Telnyx WhatsApp error: {response.text}")
                return False
            return True
    except Exception as e:
        logger.error(f"Failed to send WhatsApp: {e}")
        return False

async def send_appointment_confirmation(to, business_name, agent_name, appointment_details) -> bool:
    msg = f"✅ Appointment Confirmed at {business_name}!\n\n" \
          f"Details: {appointment_details}\n" \
          f"Assistant: {agent_name}\n\n" \
          f"See you soon!"
    return await send_whatsapp(to, msg)

async def send_escalation_alert(to, caller_number, reason) -> bool:
    msg = f"🚨 URGENT CALL ALERT!\n\n" \
          f"Caller: {caller_number}\n" \
          f"Reason: {reason}\n\n" \
          f"Please call them back immediately."
    return await send_whatsapp(to, msg)

async def send_call_summary(to, caller, summary, duration, booked, escalated, agent_name) -> bool:
    status = "✅ Booked" if booked else ("🚨 Escalated" if escalated else "ℹ️ Completed")
    msg = f"📞 Call Summary - {agent_name}\n\n" \
          f"Caller: {caller}\n" \
          f"Duration: {duration}s\n" \
          f"Status: {status}\n\n" \
          f"Summary: {summary}"
    return await send_whatsapp(to, msg)

async def send_daily_digest(to, business_name, calls, bookings, escalations) -> bool:
    msg = f"📊 Daily Digest for {business_name}\n\n" \
          f"Total Calls: {calls}\n" \
          f"New Bookings: {bookings}\n" \
          f"Urgent Escalations: {escalations}\n\n" \
          f"Great job today!"
    return await send_whatsapp(to, msg)

async def send_reminder(to, business_name, appointment_details) -> bool:
    msg = f"🔔 Reminder: Your appointment at {business_name} is coming up!\n\n" \
          f"Details: {appointment_details}\n\n" \
          f"We look forward to seeing you."
    return await send_whatsapp(to, msg)
