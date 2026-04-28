"""WhatsApp summaries and confirmations via Twilio."""
from __future__ import annotations

import logging
from typing import Iterable

from app.config import settings

try:
    from twilio.rest import Client
except ImportError:  # pragma: no cover
    Client = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


def _client() -> "Client | None":
    if Client is None:
        return None
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN):
        return None
    return Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)


def _whatsapp_from() -> str:
    number = settings.TWILIO_WHATSAPP_NUMBER or settings.TWILIO_PHONE_NUMBER or ""
    return f"whatsapp:{number}"


async def send_call_summary(
    owner_whatsapp: str,
    caller_number: str,
    conversation: Iterable[dict],
    urgent: bool = False,
) -> bool:
    client = _client()
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
            f"🚨 URGENT CALL from {caller_number}\n\n"
            f"They need immediate attention.\n\n"
            f"Conversation:\n{summary}\n\n"
            f"Tap to call back: {caller_number}"
        )
    else:
        body = (
            f"📞 Call Summary from {caller_number}\n\n"
            f"Conversation:\n{summary}\n\n"
            f"Logged in your OneClerk dashboard."
        )

    if client is None or not owner_whatsapp:
        logger.info("WhatsApp summary (not sent — no Twilio configured): %s", body)
        return False

    try:
        client.messages.create(
            from_=_whatsapp_from(),
            to=f"whatsapp:{owner_whatsapp}",
            body=body,
        )
        return True
    except Exception:  # pragma: no cover
        logger.exception("Failed to send WhatsApp summary")
        return False


async def send_caller_confirmation(
    caller_number: str,
    business_name: str,
    booking_details: str,
) -> bool:
    client = _client()
    body = (
        f"✅ Confirmed from {business_name}\n\n"
        f"{booking_details}\n\n"
        f"Need to change anything? Just call us back."
    )
    if client is None or not caller_number:
        logger.info("Caller confirmation (not sent — no Twilio configured): %s", body)
        return False
    try:
        client.messages.create(
            from_=_whatsapp_from(),
            to=f"whatsapp:{caller_number}",
            body=body,
        )
        return True
    except Exception:  # pragma: no cover
        logger.exception("Failed to send caller confirmation")
        return False


async def send_booking_link(
    to_number: str,
    business_name: str,
    agent_name: str,
    calendly_url: str | None = None,
    service: str | None = None,
) -> bool:
    """Send a booking-link WhatsApp message to the caller."""
    client = _client()
    svc = service or "your appointment"
    if calendly_url:
        body = (
            f"Hi! {agent_name} here from {business_name}.\n"
            f"Book your {svc} here:\n{calendly_url}\n\nSee you soon! 😊"
        )
    else:
        body = (
            f"Hi! {agent_name} here from {business_name}.\n"
            f"Thanks for calling about {svc}. We'll confirm your appointment shortly.\n\n"
            f"Call us back if you need anything!"
        )
    if client is None or not to_number:
        logger.info("Booking link (not sent — no Twilio configured): %s", body)
        return False
    try:
        client.messages.create(
            from_=_whatsapp_from(),
            to=f"whatsapp:{to_number}",
            body=body,
        )
        return True
    except Exception:  # pragma: no cover
        logger.exception("Failed to send booking link")
        return False


async def send_text(to_number: str, body: str) -> bool:
    """Send a plain WhatsApp text reply (used by the WhatsApp inbound handler)."""
    client = _client()
    if client is None or not to_number:
        logger.info("WhatsApp reply (not sent — no Twilio configured): %s", body)
        return False
    target = to_number if to_number.startswith("whatsapp:") else f"whatsapp:{to_number}"
    try:
        client.messages.create(from_=_whatsapp_from(), to=target, body=body)
        return True
    except Exception:  # pragma: no cover
        logger.exception("Failed to send WhatsApp reply")
        return False
