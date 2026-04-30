import uuid 
from datetime import datetime 
from sqlalchemy import String, Boolean, DateTime, Enum as SAEnum 
from sqlalchemy.orm import Mapped, mapped_column 
from app.database import Base 
import enum 
 
class BusinessType(str, enum.Enum): 
    clinic = "clinic" 
    hotel = "hotel" 
    restaurant = "restaurant" 
    salon = "salon" 
    gym = "gym" 
    legal = "legal" 
    dental = "dental" 
    startup = "startup" 
    real_estate = "real_estate" 
    other = "other" 
 
class SubscriptionTier(str, enum.Enum): 
    trial = "trial" 
    starter = "starter" 
    growth = "growth" 
    scale = "scale" 
 
class User(Base): 
    __tablename__ = "users" 
     
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4) 
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True) 
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True) 
    full_name: Mapped[str] = mapped_column(String(255)) 
    business_name: Mapped[str] = mapped_column(String(255)) 
    business_type: Mapped[BusinessType] = mapped_column(SAEnum(BusinessType), default=BusinessType.other) 
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True) 
    whatsapp_number: Mapped[str | None] = mapped_column(String(20), nullable=True) 
    google_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True) 
    google_access_token: Mapped[str | None] = mapped_column(String(2048), nullable=True) 
    google_refresh_token: Mapped[str | None] = mapped_column(String(2048), nullable=True) 
    subscription_tier: Mapped[SubscriptionTier] = mapped_column(SAEnum(SubscriptionTier), default=SubscriptionTier.trial) 
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True) 
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True) 
    is_active: Mapped[bool] = mapped_column(Boolean, default=True) 
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False) 
    timezone: Mapped[str] = mapped_column(String(50), default="UTC") 
    total_minutes_used: Mapped[float] = mapped_column(default=0.0) 
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow) 
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow) 
