"""Optional ElevenLabs / external TTS integration.

By default the call routes use Twilio's built-in Polly voices via TwiML <Say>,
which works without any extra configuration. This module is a placeholder for
swapping in a higher-quality voice once an ElevenLabs key is provided.
"""
from __future__ import annotations

from app.config import settings


async def text_to_speech_url(text: str, voice_id: str | None = None) -> str | None:
    """Return a public URL hosting TTS audio for `text`, or None if unavailable.

    Implementation requires ElevenLabs + a public storage location (e.g. S3 or
    an exposed FastAPI route). Stubbed for now.
    """
    if not settings.ELEVENLABS_API_KEY:
        return None
    return None
