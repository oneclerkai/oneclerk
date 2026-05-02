"""ElevenLabs TTS integration with on-disk caching served via /audio/{filename}.

Falls back gracefully to Twilio's Polly voice when no ElevenLabs key is set.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

AUDIO_DIR = Path("/tmp/oneclerk_audio")
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

_TTL_SECONDS = 5 * 60  # delete files older than 5 minutes


def _cache_path(text: str, voice_id: str) -> Path:
    digest = hashlib.sha1(f"{voice_id}|{text}".encode("utf-8")).hexdigest()[:24]
    return AUDIO_DIR / f"{digest}.mp3"


def cleanup_old_audio() -> None:
    cutoff = time.time() - _TTL_SECONDS
    for f in AUDIO_DIR.glob("*.mp3"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)
        except OSError:
            pass


async def synthesize_to_url(text: str, voice_id: str | None = None) -> str | None:
    """Synthesize `text` via ElevenLabs and return a public URL to the MP3.

    Returns None if ELEVENLABS_API_KEY is missing or synthesis fails.
    """
    if not settings.ELEVENLABS_API_KEY or not settings.PUBLIC_BASE_URL:
        return None

    voice = voice_id or settings.ELEVENLABS_VOICE_ID
    cache = _cache_path(text, voice)

    if not cache.exists():
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"
        headers = {
            "xi-api-key": settings.ELEVENLABS_API_KEY,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        }
        payload = {
            "text": text,
            "model_id": settings.ELEVENLABS_MODEL,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                cache.write_bytes(resp.content)
        except Exception:
            logger.exception("ElevenLabs synthesis failed")
            return None

    # background cleanup, fire-and-forget
    asyncio.get_event_loop().run_in_executor(None, cleanup_old_audio)

    base = settings.PUBLIC_BASE_URL.rstrip("/")
    return f"{base}/audio/{cache.name}"
