from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = ""
    PUBLIC_BASE_URL: str = ""

    DATABASE_URL: Optional[str] = None
    REDIS_URL: Optional[str] = None

    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    DEEPGRAM_API_KEY: Optional[str] = None
    ELEVENLABS_API_KEY: Optional[str] = None
    ELEVENLABS_VOICE_ID: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel — warm female English
    ELEVENLABS_MODEL: str = "eleven_turbo_v2_5"

    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_PHONE_NUMBER: Optional[str] = None
    TWILIO_WHATSAPP_NUMBER: Optional[str] = None

    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_STARTER_PRICE_ID: Optional[str] = None
    STRIPE_GROWTH_PRICE_ID: Optional[str] = None
    STRIPE_SCALE_PRICE_ID: Optional[str] = None

    WHATSAPP_TOKEN: Optional[str] = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
