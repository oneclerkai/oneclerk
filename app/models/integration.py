import uuid 
from datetime import datetime 
from sqlalchemy import String, ForeignKey, DateTime, Text, Boolean, JSON 
from sqlalchemy.orm import Mapped, mapped_column 
from app.database import Base 
 
class Integration(Base): 
    __tablename__ = "integrations" 
     
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4) 
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True) 
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), nullable=True) 
    integration_type: Mapped[str] = mapped_column(String(50)) 
    is_active: Mapped[bool] = mapped_column(Boolean, default=True) 
    config: Mapped[dict] = mapped_column(JSON, default=dict) 
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True) 
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True) 
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True) 
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow) 
