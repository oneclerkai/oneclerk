from pydantic import BaseModel
from typing import Optional, List, Dict
import uuid
from datetime import datetime
from app.models.agent import AgentStatus, AgentLanguage

class AgentBase(BaseModel):
    name: str
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    language: AgentLanguage = AgentLanguage.auto
    business_context: Dict = {}
    system_prompt: Optional[str] = None
    escalation_phone: Optional[str] = None
    escalation_keywords: List[str] = ["emergency", "urgent"]
    max_call_duration: int = 600
    google_calendar_id: Optional[str] = None
    calendly_url: Optional[str] = None

class AgentCreate(AgentBase):
    pass

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    voice_id: Optional[str] = None
    language: Optional[AgentLanguage] = None
    status: Optional[AgentStatus] = None
    business_context: Optional[Dict] = None
    system_prompt: Optional[str] = None
    escalation_phone: Optional[str] = None
    escalation_keywords: Optional[List[str]] = None
    max_call_duration: Optional[int] = None

class AgentOut(AgentBase):
    id: uuid.UUID
    user_id: uuid.UUID
    status: AgentStatus
    telnyx_phone: Optional[str] = None
    calls_this_month: int
    total_calls: int
    total_minutes: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
