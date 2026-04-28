from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    call_sid: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    agent_id: Mapped[str] = mapped_column(String, ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    caller_number: Mapped[str | None] = mapped_column(String, nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    conversation: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default="active")
    is_urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    booking_made: Mapped[bool] = mapped_column(Boolean, default=False)
    booking_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
