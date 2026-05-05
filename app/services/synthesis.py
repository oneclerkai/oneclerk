from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import uuid

import aiofiles

from app.config import settings
from app.services.redis_client import safe_get, safe_setex

try:
    from elevenlabs import ElevenLabs, VoiceSettings
except ImportError:  # pragma: no cover
    ElevenLabs = None  # type: ignore[assignment]
    VoiceSettings = None  # type: ignore[assignment]


AUDIO_DIR = Path("/tmp/audio")
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_FILE_TTL_MINUTES = 30

client = (
    ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
    if ElevenLabs is not None and settings.ELEVENLABS_API_KEY
    else None
)

VOICE_MAP = {
    "english": {
        "female": settings.VOICE_EN_FEMALE,
        "male": settings.VOICE_EN_MALE,
    },
    "hindi": {
        "female": settings.VOICE_HI_FEMALE,
        "male": settings.VOICE_EN_MALE,
    },
    "arabic": {
        "female": settings.VOICE_AR_FEMALE,
        "male": settings.VOICE_EN_MALE,
    },
    "tamil": {
        "female": settings.VOICE_EN_FEMALE,
        "male": settings.VOICE_EN_MALE,
    },
    "spanish": {
        "female": settings.VOICE_ES_FEMALE,
        "male": settings.VOICE_EN_MALE,
    },
}


async def synthesize(
    text: str,
    language: str = "english",
    gender: str = "female",
    voice_id: str | None = None,
) -> str:
    if client is None or VoiceSettings is None:
        return ""

    cache_key = f"audio:{hash(text + str(voice_id))}"
    cached = await safe_get(cache_key)
    if cached:
        return cached.decode() if isinstance(cached, bytes) else str(cached)

    selected_voice = voice_id or VOICE_MAP.get(language.lower(), {}).get(
        gender, settings.VOICE_EN_FEMALE
    )
    audio_generator = client.generate(
        text=text,
        voice=selected_voice,
        model=settings.ELEVENLABS_MODEL,
        voice_settings=VoiceSettings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.0,
            use_speaker_boost=True,
        ),
        stream=False,
    )

    filename = f"{uuid.uuid4()}.mp3"
    filepath = AUDIO_DIR / filename
    os.makedirs(AUDIO_DIR, exist_ok=True)
    audio_bytes = b"".join(audio_generator)
    async with aiofiles.open(filepath, "wb") as file_handle:
        await file_handle.write(audio_bytes)

    audio_url = f"{settings.BACKEND_URL.rstrip('/')}/api/audio/{filename}"
    ttl = 86400 if len(text) < 50 else 3600
    await safe_setex(cache_key, ttl, audio_url)
    return audio_url


async def synthesize_greeting(agent) -> str:
    context = agent.config or {}
    business_name = context.get("business_name", agent.name)
    greeting_text = (
        f"Thank you for calling {business_name}. "
        f"I'm {agent.name}, how can I help you today?"
    )
    return await synthesize(
        greeting_text,
        language=(agent.language or "english"),
        gender="female",
    )


async def cleanup_audio_files() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=AUDIO_FILE_TTL_MINUTES)
    for path in AUDIO_DIR.glob("*.mp3"):
        try:
            modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            if modified < cutoff:
                path.unlink(missing_ok=True)
        except OSError:
            continue


async def delete_file_later(filename: str, delay_seconds: int = AUDIO_FILE_TTL_MINUTES * 60) -> None:
    await asyncio.sleep(delay_seconds)
    path = AUDIO_DIR / Path(filename).name
    path.unlink(missing_ok=True)
