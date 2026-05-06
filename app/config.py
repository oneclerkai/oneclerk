import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"

    DATABASE_URL: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET_KEY: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""

    TELNYX_API_KEY: str = ""
    TELNYX_PUBLIC_KEY: str = ""
    TELNYX_CONNECTION_ID: str = ""
    TELNYX_PHONE_NUMBER: str = ""
    TELNYX_MESSAGING_PROFILE_ID: str = ""

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    DEEPGRAM_API_KEY: str = ""

    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_MODEL: str = "eleven_turbo_v2_5"

    VOICE_EN_FEMALE: str = "21m00Tcm4TlvDq8ikWAM"
    VOICE_EN_MALE: str = "ErXwobaYiN019PkySvjV"
    VOICE_HI_FEMALE: str = "pFZP5JQG7iQjIQuC4Bku"
    VOICE_AR_FEMALE: str = "z9fAnlkpzviPz146aGWa"
    VOICE_ES_FEMALE: str = "MF3mGyEYCl7XYWbV9V6O"
    VOICE_TA_FEMALE: str = "21m00Tcm4TlvDq8ikWAM"
    VOICE_TE_FEMALE: str = "21m00Tcm4TlvDq8ikWAM"

    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@oneclerk.ai"

    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_STARTER_PRICE_ID: str = ""
    STRIPE_GROWTH_PRICE_ID: str = ""
    STRIPE_SCALE_PRICE_ID: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""

    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
