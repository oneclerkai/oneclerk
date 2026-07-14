from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    twilio_number: Mapped[str] = mapped_column(String, nullable=True, index=True)
    telnyx_phone: Mapped[str] = mapped_column(String, nullable=True, index=True)
    telnyx_phone_sid: Mapped[str] = mapped_column(String, nullable=True)
    forwarding_number: Mapped[str] = mapped_column(String, nullable=True)
    # Per-agent Google Calendar fields (encrypted refresh token, calendar id, timezone)
    google_refresh_token_encrypted: Mapped[str] = mapped_column(String, nullable=True)
    google_calendar_id: Mapped[str] = mapped_column(String, default="primary")
    timezone: Mapped[str] = mapped_column(String, default="Asia/Kolkata")

    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="draft")
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    voice_id: Mapped[str] = mapped_column(String, default="Polly.Aditi")
    language: Mapped[str] = mapped_column(String, default="en-IN")
    calls_this_month: Mapped[int] = mapped_column(Integer, default=0)
    total_calls: Mapped[int] = mapped_column(Integer, default=0)
    escalation_phone: Mapped[str] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def business_context(self) -> dict:
        return self.config or {}
