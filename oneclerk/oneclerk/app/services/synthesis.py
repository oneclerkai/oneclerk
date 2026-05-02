import asyncio
import hashlib
import logging
import os
import time
from pathlib import Path
from typing import Optional

import httpx
from redis import Redis

from app.config import settings

logger = logging.getLogger(__name__)

# Use /tmp for ephemeral audio files
AUDIO_DIR = Path("/tmp/oneclerk_audio")
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# Redis client for caching
redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)

TELNYX_LANGUAGE_CODES = { 
    "english": "en-US", 
    "hindi": "hi-IN", 
    "arabic": "ar", 
    "tamil": "ta-IN", 
    "telugu": "te-IN", 
    "malayalam": "ml-IN", 
    "marathi": "mr-IN", 
    "kannada": "kn-IN", 
    "bengali": "bn-IN", 
    "punjabi": "pa-IN", 
    "spanish": "es-419", 
    "portuguese": "pt-BR", 
    "french": "fr-FR", 
    "german": "de-DE", 
    "japanese": "ja-JP", 
    "korean": "ko-KR", 
    "chinese": "cmn-Hans-CN", 
    "auto": "en-US" 
}

VOICE_MAP = {
    "english": settings.VOICE_EN_FEMALE,
    "hindi": settings.VOICE_HI_FEMALE,
    "arabic": settings.VOICE_AR_FEMALE,
    "tamil": settings.VOICE_TA_FEMALE,
    "telugu": settings.VOICE_TE_FEMALE,
    "malayalam": settings.VOICE_ML_FEMALE,
    "marathi": settings.VOICE_MR_FEMALE,
    "kannada": settings.VOICE_KN_FEMALE,
    "bengali": settings.VOICE_BN_FEMALE,
    "spanish": settings.VOICE_ES_FEMALE,
    "portuguese": settings.VOICE_PT_FEMALE,
    "french": settings.VOICE_FR_FEMALE,
    "german": settings.VOICE_DE_FEMALE,
}

def cleanup_old_audio():
    """Delete files older than 30 minutes."""
    cutoff = time.time() - (30 * 60)
    for f in AUDIO_DIR.glob("*.mp3"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)
        except Exception as e:
            logger.error(f"Error cleaning up file {f}: {e}")

async def synthesize(text: str, language: str = "english") -> Optional[str]:
    """
    Synthesize text to speech using ElevenLabs and return the filename.
    Uses Redis for caching synthesis results.
    """
    if not settings.ELEVENLABS_API_KEY:
        logger.error("ELEVENLABS_API_KEY not configured")
        return None

    voice_id = VOICE_MAP.get(language, settings.VOICE_EN_FEMALE)
    
    # Generate a unique cache key
    cache_key = f"tts:{voice_id}:{hashlib.md5(text.encode()).hexdigest()}"
    
    # Check Redis cache first
    cached_filename = redis_client.get(cache_key)
    if cached_filename and (AUDIO_DIR / cached_filename).exists():
        return cached_filename

    # Call ElevenLabs API
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    data = {
        "text": text,
        "model_id": settings.ELEVENLABS_MODEL,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=data, timeout=30.0)
            if response.status_code != 200:
                logger.error(f"ElevenLabs API error: {response.text}")
                return None
            
            filename = f"{cache_key.replace(':', '_')}.mp3"
            filepath = AUDIO_DIR / filename
            filepath.write_bytes(response.content)
            
            # Cache the filename in Redis for 1 hour
            redis_client.setex(cache_key, 3600, filename)
            
            # Run cleanup in background
            asyncio.create_task(asyncio.to_thread(cleanup_old_audio))
            
            return filename
    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        return None

def get_audio_url(filename: str) -> str:
    """Return the full URL to serve the audio file."""
    return f"{settings.BACKEND_URL}/api/audio/{filename}"
