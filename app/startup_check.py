from __future__ import annotations

import sys

from app.config import settings


def check_all_services() -> None:
    required = [
        ("DATABASE_URL", settings.DATABASE_URL, "PostgreSQL database"),
        ("OPENAI_API_KEY", settings.OPENAI_API_KEY, "OpenAI GPT"),
        ("TELNYX_API_KEY", settings.TELNYX_API_KEY, "Telnyx voice calls"),
        ("ELEVENLABS_API_KEY", settings.ELEVENLABS_API_KEY, "ElevenLabs TTS"),
        ("JWT_SECRET_KEY", settings.JWT_SECRET_KEY, "JWT authentication"),
        ("STRIPE_SECRET_KEY", settings.STRIPE_SECRET_KEY, "Stripe billing"),
    ]
    optional = [
        ("DEEPGRAM_API_KEY", settings.DEEPGRAM_API_KEY, "Deepgram STT"),
        ("REDIS_URL", settings.REDIS_URL, "Redis caching"),
    ]
    print("\n=== OneClerk.ai Service Check ===")
    all_ok = True
    for name, value, description in required:
        status = "OK" if value else "MISSING"
        print(f"{status} {description} ({name})")
        if not value:
            all_ok = False
    for name, value, description in optional:
        status = "OK" if value else "OPTIONAL"
        print(f"{status} {description} ({name})")
    print("================================\n")
    if settings.ENVIRONMENT == "production" and not all_ok:
        print("ERROR: Required services not configured. Add missing environment variables.")
        sys.exit(1)
