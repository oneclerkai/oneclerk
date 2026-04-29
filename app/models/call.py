import uuid, enum 
from datetime import datetime 
from sqlalchemy import String, Integer, Float, JSON, ForeignKey, DateTime, Enum as SAEnum, Text, Boolean 
from sqlalchemy.orm import Mapped, mapped_column 
from app.database import Base 
 
class CallStatus(str, enum.Enum): 
    in_progress = "in_progress" 
    completed = "completed" 
    missed = "missed" 
    escalated = "escalated" 
    failed = "failed" 
 
class Call(Base): 
    __tablename__ = "calls" 
     
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4) 
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True) 
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True) 
    telnyx_call_sid: Mapped[str] = mapped_column(String(255), unique=True, index=True) 
    caller_number: Mapped[str] = mapped_column(String(20)) 
    caller_name: Mapped[str | None] = mapped_column(String(255), nullable=True) 
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0) 
    duration_minutes: Mapped[float] = mapped_column(Float, default=0.0) 
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0) 
    status: Mapped[CallStatus] = mapped_column(SAEnum(CallStatus), default=CallStatus.in_progress) 
    escalated: Mapped[bool] = mapped_column(Boolean, default=False) 
    escalation_reason: Mapped[str | None] = mapped_column(Text, nullable=True) 
    summary: Mapped[str | None] = mapped_column(Text, nullable=True) 
    appointment_booked: Mapped[bool] = mapped_column(Boolean, default=False) 
    appointment_details: Mapped[dict | None] = mapped_column(JSON, nullable=True) 
    whatsapp_sent: Mapped[bool] = mapped_column(Boolean, default=False) 
    calendar_event_created: Mapped[bool] = mapped_column(Boolean, default=False) 
    detected_language: Mapped[str | None] = mapped_column(String(50), nullable=True) 
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow) 
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True) 
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow) 
