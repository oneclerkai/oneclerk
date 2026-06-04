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


async def send_no_show_alert(
    owner_whatsapp: str,
    caller_number: str,
    agent_name: str,
    appointment_details: str = "",
) -> bool:
    """Notify owner via WhatsApp when a booked caller doesn't show up."""
    appt = f"\nAppointment: {appointment_details}" if appointment_details else ""
    body = (
        f"⚠️ *No-show alert — {agent_name}*\n\n"
        f"Caller: {caller_number}{appt}\n\n"
        f"A follow-up message has been sent to the caller automatically.\n"
        f"Check your dashboard for details."
    )
    return await _send_telnyx_message(owner_whatsapp, body)


async def send_technical_error_alert(
    owner_whatsapp: str,
    caller_number: str,
    agent_name: str,
    error_context: str = "",
) -> bool:
    """Notify owner when a call ended due to a technical error."""
    ctx = f"\nContext: {error_context}" if error_context else ""
    body = (
        f"⚡ *Technical error — {agent_name}*\n\n"
        f"A call from {caller_number} may have dropped unexpectedly.{ctx}\n\n"
        f"Please check your dashboard and follow up with the caller if needed."
    )
    return await _send_telnyx_message(owner_whatsapp, body)


async def send_call_transcript_whatsapp(
    owner_whatsapp: str,
    caller_number: str,
    agent_name: str,
    summary: str,
    duration_seconds: int = 0,
    appointment_booked: bool = False,
) -> bool:
    """Send a concise post-call transcript summary to the owner via WhatsApp."""
    duration_fmt = f"{duration_seconds // 60}m {duration_seconds % 60}s" if duration_seconds else ""
    booked = "✅ Appointment booked" if appointment_booked else ""
    lines = [
        f"📞 *Call summary — {agent_name}*",
        f"Caller: {caller_number}",
    ]
    if duration_fmt:
        lines.append(f"Duration: {duration_fmt}")
    if booked:
        lines.append(booked)
    lines.append("")
    lines.append(summary[:600] if summary else "(No summary available)")
    return await _send_telnyx_message(owner_whatsapp, "\n".join(lines))


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
