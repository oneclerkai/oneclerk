"""Twilio SMS service for OneClerk.

Sends OTP codes and notifications via Twilio SMS.
"""
from __future__ import annotations

import asyncio
import logging
import secrets

from app.config import settings
from app.services.redis_client import safe_delete, safe_get, safe_setex

logger = logging.getLogger("oneclerk.sms_service")

try:
    from twilio.rest import Client as TwilioClient
except ImportError:  # pragma: no cover
    TwilioClient = None  # type: ignore[assignment]

# OTP TTL: 10 minutes (600 seconds)
OTP_TTL_SECONDS = 600


def _phone_otp_key(phone_number: str) -> str:
    return f"sms_otp:{phone_number.strip()}"


def generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _send_sms_sync(phone_number: str, body: str) -> None:
    """Send SMS via Twilio (synchronous — run in thread)."""
    if TwilioClient is None:
        raise RuntimeError("twilio package is not installed. Run: pip install twilio")

    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    client.messages.create(
        body=body,
        from_=settings.TWILIO_PHONE_NUMBER,
        to=phone_number,
    )


async def send_otp_sms(phone_number: str, otp: str) -> bool:
    """Send an OTP SMS to the given phone number via Twilio.

    Stores the OTP in Redis with a 10-minute TTL.
    Returns True if sent, False if Twilio is not configured.
    Raises on Twilio errors.
    """
    if not (
        settings.TWILIO_ACCOUNT_SID
        and settings.TWILIO_AUTH_TOKEN
        and settings.TWILIO_PHONE_NUMBER
    ):
        logger.debug("Twilio not configured — skipping SMS OTP for %s", phone_number)
        return False

    message = f"Your OneClerk verification code is: {otp}. It expires in 10 minutes. Do not share this code."

    await asyncio.to_thread(_send_sms_sync, phone_number, message)
    logger.info("OTP SMS sent to %s via Twilio", phone_number)
    return True


async def store_otp(phone_number: str, otp: str) -> None:
    """Store OTP in Redis with 10-minute TTL."""
    await safe_setex(_phone_otp_key(phone_number), OTP_TTL_SECONDS, otp)


async def verify_otp(phone_number: str, otp: str) -> bool:
    """Verify OTP from Redis. Returns True if valid, False otherwise.
    Deletes the OTP from Redis on successful verification.
    """
    stored_raw = await safe_get(_phone_otp_key(phone_number))
    if stored_raw is None:
        return False
    stored = stored_raw.decode("utf-8") if isinstance(stored_raw, bytes) else str(stored_raw)
    if stored.strip() != otp.strip():
        return False
    await safe_delete(_phone_otp_key(phone_number))
    return True


async def send_and_store_otp(phone_number: str) -> tuple[str, bool]:
    """Generate OTP, store in Redis, and send via Twilio.

    Returns (otp, sent) where sent=True if Twilio delivered it.
    """
    otp = generate_otp()
    await store_otp(phone_number, otp)
    sent = await send_otp_sms(phone_number, otp)
    return otp, sent
