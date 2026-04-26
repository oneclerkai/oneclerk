from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Conversation(Base):
    """Per-turn conversation log (optional; Call.conversation also stores rolled-up history)."""

    __tablename__ = "conversation_turns"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    call_id: Mapped[str] = mapped_column(String, ForeignKey("calls.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
