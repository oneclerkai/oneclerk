from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _trial_end() -> datetime:
    return datetime.utcnow() + timedelta(days=7)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    username: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True, nullable=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=True)
    whatsapp_number: Mapped[str] = mapped_column(String, nullable=True)
    plan: Mapped[str] = mapped_column(String, default="trial")
    subscription_tier: Mapped[str] = mapped_column(String, default="trial")
    trial_ends_at: Mapped[datetime] = mapped_column(DateTime, default=_trial_end)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    stripe_customer_id: Mapped[str] = mapped_column(String, nullable=True)
    stripe_subscription_id: Mapped[str] = mapped_column(String, nullable=True)
    subscription_status: Mapped[str] = mapped_column(String, nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    business_profile: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=True)

    # Rollover minutes engine
    minutes_used_this_month: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rollover_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rollover_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    usage_alert_80_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    usage_alert_100_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    razorpay_payment_id: Mapped[str] = mapped_column(String, nullable=True)
    razorpay_order_id: Mapped[str] = mapped_column(String, nullable=True)
