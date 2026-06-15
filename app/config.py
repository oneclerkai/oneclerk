from __future__ import annotations

from functools import lru_cache
import logging
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("oneclerk.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("backend/.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    SECRET_KEY: str = "change-me"
    FRONTEND_URL: str = ""
    PUBLIC_BASE_URL: str = ""
    BACKEND_URL: str = ""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        import os
        replit_domain = os.environ.get("REPLIT_DEV_DOMAIN") or os.environ.get("REPLIT_DOMAINS", "").split(",")[0].strip()
        if replit_domain:
            base_url = f"https://{replit_domain}"
            if not self.FRONTEND_URL:
                object.__setattr__(self, "FRONTEND_URL", base_url)
            if not self.PUBLIC_BASE_URL:
                object.__setattr__(self, "PUBLIC_BASE_URL", base_url)
            if not self.BACKEND_URL:
                object.__setattr__(self, "BACKEND_URL", base_url)
        else:
            if not self.FRONTEND_URL:
                object.__setattr__(self, "FRONTEND_URL", "http://localhost:3000")
            if not self.PUBLIC_BASE_URL:
                object.__setattr__(self, "PUBLIC_BASE_URL", "http://localhost:5000")
            if not self.BACKEND_URL:
                object.__setattr__(self, "BACKEND_URL", "http://localhost:5000")

    DATABASE_URL: str | None = None
    REDIS_URL: str | None = None

    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    TELNYX_API_KEY: str | None = None
    TELNYX_PUBLIC_KEY: str | None = None
    TELNYX_APP_ID: str | None = None
    TELNYX_CONNECTION_ID: str | None = None

    RESEND_API_KEY: str | None = None
    RESEND_FROM_EMAIL: str = "OneClerk <verify@oneclerk.ai>"

    TWILIO_ACCOUNT_SID: str | None = None
    TWILIO_AUTH_TOKEN: str | None = None
    TWILIO_PHONE_NUMBER: str | None = None

    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    DEEPGRAM_API_KEY: str | None = None
    USE_TELNYX_STT: bool = True
    DEEPGRAM_FALLBACK_CONFIDENCE: float = 0.7

    ELEVENLABS_API_KEY: str | None = None
    ELEVENLABS_MODEL: str = "eleven_turbo_v2_5"
    ELEVENLABS_VOICE_ID: str = "21m00Tcm4TlvDq8ikWAM"
    VOICE_EN_FEMALE: str = "21m00Tcm4TlvDq8ikWAM"
    VOICE_EN_MALE: str = "ErXwobaYiN019PkySvjV"
    VOICE_HI_FEMALE: str = "pFZP5JQG7iQjIQuC4Bku"
    VOICE_AR_FEMALE: str = "z9fAnlkpzviPz146aGWa"
    VOICE_ES_FEMALE: str = "MF3mGyEYCl7XYWbV9V6O"

    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REFRESH_TOKEN: str | None = None
    GOOGLE_CALENDAR_ID: str = "primary"

    RAZORPAY_KEY_ID: str | None = None
    RAZORPAY_KEY_SECRET: str | None = None

    VAPI_SECRET_KEY: str | None = None
    VAPI_WEBHOOK_SECRET: str | None = None

    FORWARD_TARGET_PHONE: str | None = None

    SYSTEM_GMAIL_USER: str | None = None
    SYSTEM_GMAIL_APP_PASS: str | None = None

    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_STARTER_PRICE_ID: str | None = None
    STRIPE_GROWTH_PRICE_ID: str | None = None
    STRIPE_SCALE_PRICE_ID: str | None = None

    WHATSAPP_API_URL: str | None = None
    WHATSAPP_FROM: str | None = None

    # Optional OpenRouter compatibility (acts as an OpenAI-compatible proxy)
    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_MODEL: str | None = "openchat/openchat-7b:free"

    STARTUP_REQUIRED_KEYS: tuple[str, ...] = Field(
        default=(
            "SECRET_KEY",
            "DATABASE_URL",
            "REDIS_URL",
            "JWT_SECRET_KEY",
            "OPENAI_API_KEY",
            "TELNYX_API_KEY",
            "TELNYX_PUBLIC_KEY",
            "ELEVENLABS_API_KEY",
        )
    )

    def service_checklist(self) -> dict[str, bool]:
        return {
            "database": bool(self.DATABASE_URL),
            "redis": bool(self.REDIS_URL),
            "jwt": bool(self.JWT_SECRET_KEY),
            "telnyx": bool(self.TELNYX_API_KEY and self.TELNYX_PUBLIC_KEY),
            "resend": bool(self.RESEND_API_KEY),
            "twilio": bool(
                self.TWILIO_ACCOUNT_SID
                and self.TWILIO_AUTH_TOKEN
                and self.TWILIO_PHONE_NUMBER
            ),
            "openai": bool(self.OPENAI_API_KEY),
            "deepgram": bool(self.DEEPGRAM_API_KEY),
            "elevenlabs": bool(self.ELEVENLABS_API_KEY),
            "stripe": bool(self.STRIPE_SECRET_KEY),
            "razorpay": bool(self.RAZORPAY_KEY_ID and self.RAZORPAY_KEY_SECRET),
            "google_calendar": bool(self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET and self.GOOGLE_REFRESH_TOKEN),
            "whatsapp": bool(self.WHATSAPP_FROM and self.WHATSAPP_API_URL),
        }

    def missing_critical_settings(self) -> list[str]:
        missing: list[str] = []
        for key in self.STARTUP_REQUIRED_KEYS:
            value = getattr(self, key, None)
            if value is None or (isinstance(value, str) and not value.strip()):
                missing.append(key)
        return missing

    def validate_startup(self) -> None:
        missing = self.missing_critical_settings()
        if missing and self.ENVIRONMENT == "production":
            raise RuntimeError(
                "Missing required environment variables: " + ", ".join(missing)
            )
        if missing:
            logger.warning(
                "Missing environment variables for full functionality: %s",
                ", ".join(missing),
            )

    def log_service_checklist(self) -> None:
        for name, configured in self.service_checklist().items():
            logger.info(
                "startup_check service=%s configured=%s",
                name,
                "yes" if configured else "no",
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
