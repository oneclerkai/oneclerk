from datetime import datetime
from typing import Any
from enum import Enum
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CallStatus(str, Enum):
    in_progress = "in_progress"
    completed = "completed"
    escalated = "escalated"
    failed = "failed"


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    call_sid: Mapped[str] = mapped_column(String, unique=True, nullable=True, index=True)
    telnyx_call_sid: Mapped[str] = mapped_column(String, nullable=True, index=True)
    agent_id: Mapped[str] = mapped_column(String, ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    caller_number: Mapped[str] = mapped_column(String, nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    conversation: Mapped[list[Any]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default=CallStatus.in_progress.value)
    is_urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    escalation_reason: Mapped[str] = mapped_column(Text, nullable=True)
    booking_made: Mapped[bool] = mapped_column(Boolean, default=False)
    appointment_booked: Mapped[bool] = mapped_column(Boolean, default=False)
    booking_details: Mapped[str] = mapped_column(Text, nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
