import uuid, enum 
from datetime import datetime 
from sqlalchemy import String, Integer, Float, JSON, ForeignKey, DateTime, Enum as SAEnum, Text, Boolean 
from sqlalchemy.orm import Mapped, mapped_column 
from app.database import Base 
 
class AgentStatus(str, enum.Enum): 
    active = "active" 
    inactive = "inactive" 
    testing = "testing" 
 
class AgentLanguage(str, enum.Enum): 
    english = "english" 
    hindi = "hindi" 
    arabic = "arabic" 
    tamil = "tamil" 
    telugu = "telugu" 
    malayalam = "malayalam" 
    marathi = "marathi" 
    kannada = "kannada" 
    bengali = "bengali" 
    punjabi = "punjabi" 
    spanish = "spanish" 
    portuguese = "portuguese" 
    french = "french" 
    german = "german" 
    japanese = "japanese" 
    korean = "korean" 
    chinese = "chinese" 
    auto = "auto" 
 
class Agent(Base): 
    __tablename__ = "agents" 
     
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4) 
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True) 
    name: Mapped[str] = mapped_column(String(100)) 
    voice_id: Mapped[str] = mapped_column(String(100), default="21m00Tcm4TlvDq8ikWAM") 
    language: Mapped[AgentLanguage] = mapped_column(SAEnum(AgentLanguage), default=AgentLanguage.auto) 
    status: Mapped[AgentStatus] = mapped_column(SAEnum(AgentStatus), default=AgentStatus.inactive) 
    business_context: Mapped[dict] = mapped_column(JSON, default=dict) 
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True) 
    telnyx_phone: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True) 
    telnyx_phone_sid: Mapped[str | None] = mapped_column(String(255), nullable=True) 
    escalation_phone: Mapped[str | None] = mapped_column(String(20), nullable=True) 
    escalation_keywords: Mapped[list] = mapped_column(JSON, default=lambda: ["emergency", "urgent", "pain", "dying", "bleeding", "accident", "help"]) 
    max_call_duration: Mapped[int] = mapped_column(Integer, default=600) 
    calls_this_month: Mapped[int] = mapped_column(Integer, default=0) 
    total_calls: Mapped[int] = mapped_column(Integer, default=0) 
    total_minutes: Mapped[float] = mapped_column(Float, default=0.0) 
    google_calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True) 
    calendly_url: Mapped[str | None] = mapped_column(String(500), nullable=True) 
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow) 
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow) 
