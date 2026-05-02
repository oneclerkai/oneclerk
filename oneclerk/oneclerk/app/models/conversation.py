import uuid, enum 
from datetime import datetime 
from sqlalchemy import String, ForeignKey, DateTime, Enum as SAEnum, Text, Integer 
from sqlalchemy.orm import Mapped, mapped_column 
from app.database import Base 
 
class ConversationRole(str, enum.Enum): 
    user = "user" 
    assistant = "assistant" 
 
class ConversationTurn(Base): 
    __tablename__ = "conversation_turns" 
     
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4) 
    call_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("calls.id", ondelete="CASCADE"), index=True) 
    role: Mapped[ConversationRole] = mapped_column(SAEnum(ConversationRole)) 
    content: Mapped[str] = mapped_column(Text) 
    timestamp_ms: Mapped[int] = mapped_column(Integer, default=0) 
    source: Mapped[str] = mapped_column(String(20), default="voice") 
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow) 
