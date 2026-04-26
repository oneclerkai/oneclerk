from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _trial_end() -> datetime:
    return datetime.utcnow() + timedelta(days=14)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    whatsapp_number: Mapped[str | None] = mapped_column(String, nullable=True)
    plan: Mapped[str] = mapped_column(String, default="trial")
    trial_ends_at: Mapped[datetime] = mapped_column(DateTime, default=_trial_end)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
