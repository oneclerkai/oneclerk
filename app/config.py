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
    FRONTEND_URL: str = "http://localhost:3000"
    PUBLIC_BASE_URL: str = "http://localhost:5000"
    BACKEND_URL: str = "http://localhost:5000"

    DATABASE_URL: str | None = None
    REDIS_URL: str | None = None

    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    TELNYX_API_KEY: str | None = None
    TELNYX_PUBLIC_KEY: str | None = None
    TELNYX_APP_ID: str | None = None
    TELNYX_CONNECTION_ID: str | None = None

    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    DEEPGRAM_API_KEY: str | None = None
    USE_TELNYX_STT: bool = True
    DEEPGRAM_FALLBACK_CONFIDENCE: float = 0.7

    ELEVENLABS_API_KEY: str | None = None
    ELEVENLABS_MODEL: str = "eleven_turbo_v2_5"
    VOICE_EN_FEMALE: str = "21m00Tcm4TlvDq8ikWAM"
    VOICE_EN_MALE: str = "ErXwobaYiN019PkySvjV"
    VOICE_HI_FEMALE: str = "pFZP5JQG7iQjIQuC4Bku"
    VOICE_AR_FEMALE: str = "z9fAnlkpzviPz146aGWa"
    VOICE_ES_FEMALE: str = "MF3mGyEYCl7XYWbV9V6O"

    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_STARTER_PRICE_ID: str | None = None
    STRIPE_GROWTH_PRICE_ID: str | None = None
    STRIPE_SCALE_PRICE_ID: str | None = None

    WHATSAPP_API_URL: str = "https://api.telnyx.com/v2/messages"
    WHATSAPP_FROM: str | None = None

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
            "openai": bool(self.OPENAI_API_KEY),
            "deepgram": bool(self.DEEPGRAM_API_KEY),
            "elevenlabs": bool(self.ELEVENLABS_API_KEY),
            "stripe": bool(self.STRIPE_SECRET_KEY),
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
