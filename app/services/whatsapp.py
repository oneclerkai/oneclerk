from __future__ import annotations

import logging
from typing import Iterable

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def _send_telnyx_message(to_number: str, body: str) -> bool:
    if not (settings.TELNYX_API_KEY and settings.WHATSAPP_FROM and settings.WHATSAPP_API_URL):
        logger.info("WhatsApp message not sent because Telnyx WhatsApp is not configured: %s", body)
        return False
    payload = {"from": settings.WHATSAPP_FROM, "to": to_number, "text": body}
    headers = {
        "Authorization": f"Bearer {settings.TELNYX_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(settings.WHATSAPP_API_URL, json=payload, headers=headers)
            response.raise_for_status()
        return True
    except Exception:
        logger.exception("Failed to send WhatsApp message via Telnyx")
        return False


async def send_call_summary(
    owner_whatsapp: str,
    caller_number: str,
    conversation: Iterable[dict],
    urgent: bool = False,
) -> bool:
    summary_lines: list[str] = []
    for msg in conversation:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            summary_lines.append(f"Caller: {content}")
        elif role == "assistant":
            summary_lines.append(f"OneClerk: {content}")
    summary = "\n".join(summary_lines[-6:])
    if urgent:
        body = (
            f"URGENT CALL from {caller_number}\n\n"
            f"They need immediate attention.\n\n"
            f"Conversation:\n{summary}\n\n"
            f"Tap to call back: {caller_number}"
        )
    else:
        body = (
            f"Call Summary from {caller_number}\n\n"
            f"Conversation:\n{summary}\n\n"
            f"Logged in your OneClerk dashboard."
        )
    return await _send_telnyx_message(owner_whatsapp, body)


async def send_caller_confirmation(caller_number: str, business_name: str, booking_details: str) -> bool:
    body = (
        f"Confirmed from {business_name}\n\n"
        f"{booking_details}\n\n"
        f"Need to change anything? Just call us back."
    )
    return await _send_telnyx_message(caller_number, body)


async def send_booking_link(
    to_number: str,
    business_name: str,
    agent_name: str,
    calendly_url: str | None = None,
    service: str | None = None,
) -> bool:
    svc = service or "your appointment"
    if calendly_url:
        body = (
            f"Hi! {agent_name} here from {business_name}.\n"
            f"Book your {svc} here:\n{calendly_url}\n\nSee you soon!"
        )
    else:
        body = (
            f"Hi! {agent_name} here from {business_name}.\n"
            f"Thanks for calling about {svc}. We'll confirm your appointment shortly.\n\n"
            f"Call us back if you need anything!"
        )
    return await _send_telnyx_message(to_number, body)


async def send_text(to_number: str, body: str) -> bool:
    return await _send_telnyx_message(to_number, body)


async def send_escalation_alert(owner_whatsapp: str | None, caller_number: str, alert_text: str) -> bool:
    if not owner_whatsapp:
        return False
    body = f"Emergency alert\nCaller: {caller_number}\n{alert_text}"
    return await _send_telnyx_message(owner_whatsapp, body)


async def send_call_summary_to_owner(
    owner_whatsapp: str,
    caller_number: str,
    summary: str,
    duration_seconds: int,
    escalated: bool,
    appointment_booked: bool,
    agent_name: str,
) -> bool:
    body = (
        f"Call summary from {agent_name}\n"
        f"Caller: {caller_number}\n"
        f"Duration: {duration_seconds}s\n"
        f"Escalated: {'yes' if escalated else 'no'}\n"
        f"Appointment booked: {'yes' if appointment_booked else 'no'}\n\n"
        f"{summary}"
    )
    return await _send_telnyx_message(owner_whatsapp, body)


async def send_daily_digest(
    owner_whatsapp: str,
    business_name: str,
    calls_yesterday: int,
    bookings: int,
    escalations: int,
) -> bool:
    body = (
        f"Daily digest for {business_name}\n"
        f"Calls: {calls_yesterday}\n"
        f"Bookings: {bookings}\n"
        f"Escalations: {escalations}"
    )
    return await _send_telnyx_message(owner_whatsapp, body)
