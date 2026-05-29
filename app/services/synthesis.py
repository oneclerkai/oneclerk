"""Audio synthesis service.

Key behaviours
--------------
* Outputs 8 000 Hz µ-law (ulaw) audio to fix the "chipmunk" voice bug on PSTN.
* Splits text by sentence and streams audio chunks sequentially for < 800 ms
  first-audio latency.
* Exposes ``synthesize_sentences`` for streaming playback chaining.
* Falls back gracefully when ElevenLabs is not configured.
"""
from __future__ import annotations

import asyncio
import io
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncGenerator, AsyncIterator

import aiofiles

from app.config import settings
from app.services.redis_client import safe_get, safe_setex

logger = logging.getLogger("oneclerk.synthesis")

try:
    from elevenlabs import ElevenLabs, VoiceSettings
except ImportError:  # pragma: no cover
    ElevenLabs = None  # type: ignore[assignment]
    VoiceSettings = None  # type: ignore[assignment]

try:
    from pydub import AudioSegment  # type: ignore
    _PYDUB_AVAILABLE = True
except ImportError:  # pragma: no cover
    _PYDUB_AVAILABLE = False
    logger.warning("pydub not installed — audio will be served as raw MP3 (may cause chipmunk voice on PSTN)")

AUDIO_DIR = Path("/tmp/audio")
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_FILE_TTL_MINUTES = 30

# ---------------------------------------------------------------------------
# ElevenLabs client
# ---------------------------------------------------------------------------

client = (
    ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
    if ElevenLabs is not None and settings.ELEVENLABS_API_KEY
    else None
)

VOICE_MAP = {
    "english": {"female": settings.VOICE_EN_FEMALE, "male": settings.VOICE_EN_MALE},
    "hindi":   {"female": settings.VOICE_HI_FEMALE, "male": settings.VOICE_EN_MALE},
    "arabic":  {"female": settings.VOICE_AR_FEMALE, "male": settings.VOICE_EN_MALE},
    "tamil":   {"female": settings.VOICE_EN_FEMALE, "male": settings.VOICE_EN_MALE},
    "spanish": {"female": settings.VOICE_ES_FEMALE, "male": settings.VOICE_EN_MALE},
}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _split_sentences(text: str) -> list[str]:
    """Split text into sentences for streaming synthesis."""
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def _mp3_to_ulaw(mp3_bytes: bytes) -> bytes:
    """Convert MP3 bytes → 8 000 Hz mono µ-law WAV bytes using pydub.

    This is the fix for the "chipmunk" voice bug: PSTN telephony (Telnyx /
    Twilio) expects 8 kHz µ-law audio.  ElevenLabs returns 44.1 kHz MP3 by
    default, which plays back at the wrong pitch.
    """
    if not _PYDUB_AVAILABLE:
        return mp3_bytes  # best-effort fallback
    try:
        seg = AudioSegment.from_file(io.BytesIO(mp3_bytes), format="mp3")
        seg = seg.set_frame_rate(8000).set_channels(1).set_sample_width(2)
        buf = io.BytesIO()
        seg.export(buf, format="wav", codec="pcm_mulaw")
        return buf.getvalue()
    except Exception:
        logger.exception("pydub conversion failed — returning raw MP3")
        return mp3_bytes


def _audio_extension() -> str:
    return "wav" if _PYDUB_AVAILABLE else "mp3"


def _audio_media_type() -> str:
    return "audio/wav" if _PYDUB_AVAILABLE else "audio/mpeg"


async def _fetch_elevenlabs(text: str, voice_id: str) -> bytes:
    """Call ElevenLabs and return raw MP3 bytes."""
    if client is None or VoiceSettings is None:
        return b""
    audio_generator = client.generate(
        text=text,
        voice=voice_id,
        model=settings.ELEVENLABS_MODEL,
        voice_settings=VoiceSettings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.0,
            use_speaker_boost=True,
        ),
        stream=False,
    )
    return b"".join(audio_generator)


async def _save_audio(audio_bytes: bytes, ext: str) -> str:
    """Write audio bytes to disk and return the public URL."""
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = AUDIO_DIR / filename
    async with aiofiles.open(filepath, "wb") as fh:
        await fh.write(audio_bytes)
    return f"{settings.BACKEND_URL.rstrip('/')}/api/audio/{filename}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def synthesize(
    text: str,
    language: str = "english",
    gender: str = "female",
    voice_id: str | None = None,
) -> str:
    """Synthesize *text* and return a single public audio URL.

    Audio is converted to 8 kHz µ-law WAV before saving so it plays correctly
    on PSTN telephony without pitch distortion.
    """
    if client is None or VoiceSettings is None:
        return ""

    cache_key = f"audio:{hash(text + str(voice_id))}"
    cached = await safe_get(cache_key)
    if cached:
        return cached.decode() if isinstance(cached, bytes) else str(cached)

    selected_voice = voice_id or VOICE_MAP.get(language.lower(), {}).get(
        gender, settings.VOICE_EN_FEMALE
    )

    mp3_bytes = await _fetch_elevenlabs(text, selected_voice)
    if not mp3_bytes:
        return ""

    audio_bytes = _mp3_to_ulaw(mp3_bytes)
    ext = _audio_extension()
    audio_url = await _save_audio(audio_bytes, ext)

    ttl = 86400 if len(text) < 50 else 3600
    await safe_setex(cache_key, ttl, audio_url)
    return audio_url


def _sentence_cache_key(sentence: str, voice_id: str | None) -> str:
    fingerprint = f"{sentence.strip().lower()}:{voice_id or ''}"
    return f"audio_sentence:{hash(fingerprint)}"


async def synthesize_sentences(
    text: str,
    language: str = "english",
    gender: str = "female",
    voice_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Yield one audio URL per sentence for low-latency streaming playback.

    The caller should chain playback: start the first URL immediately, then
    queue subsequent URLs as they arrive.  This achieves < 800 ms first-audio
    latency because synthesis of sentence 1 starts before the full response
    text is processed.
    """
    if client is None or VoiceSettings is None:
        url = await synthesize(text, language, gender, voice_id)
        if url:
            yield url
        return

    selected_voice = voice_id or VOICE_MAP.get(language.lower(), {}).get(
        gender, settings.VOICE_EN_FEMALE
    )
    sentences = _split_sentences(text)
    if not sentences:
        return

    for sentence in sentences:
        cache_key = _sentence_cache_key(sentence, selected_voice)
        cached_url = await safe_get(cache_key)
        if cached_url:
            url = cached_url.decode() if isinstance(cached_url, bytes) else str(cached_url)
            yield url
            continue

        mp3_bytes = await _fetch_elevenlabs(sentence, selected_voice)
        if not mp3_bytes:
            continue
        audio_bytes = _mp3_to_ulaw(mp3_bytes)
        ext = _audio_extension()
        url = await _save_audio(audio_bytes, ext)
        await safe_setex(cache_key, 86400, url)
        yield url


async def synthesize_greeting(agent) -> str:
    """Build and synthesize the legal-compliant call greeting."""
    context = agent.config or {}
    business_name = context.get("business_name", agent.name)
    greeting_text = (
        f"Thank you for calling {business_name}. "
        f"This call may be recorded for quality. "
        f"I'm {agent.name}, how can I help you today?"
    )
    return await synthesize(
        greeting_text,
        language=(agent.language or "english"),
        gender="female",
    )


# ---------------------------------------------------------------------------
# File lifecycle helpers
# ---------------------------------------------------------------------------

async def cleanup_audio_files() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=AUDIO_FILE_TTL_MINUTES)
    for path in AUDIO_DIR.glob("*.wav"):
        try:
            modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            if modified < cutoff:
                path.unlink(missing_ok=True)
        except OSError:
            continue
    # Also clean legacy MP3 files
    for path in AUDIO_DIR.glob("*.mp3"):
        try:
            modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            if modified < cutoff:
                path.unlink(missing_ok=True)
        except OSError:
            continue


async def delete_file_later(
    filename: str,
    delay_seconds: int = AUDIO_FILE_TTL_MINUTES * 60,
) -> None:
    await asyncio.sleep(delay_seconds)
    path = AUDIO_DIR / Path(filename).name
    path.unlink(missing_ok=True)
