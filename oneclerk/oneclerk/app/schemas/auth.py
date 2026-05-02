from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    business_name: Optional[str] = None
    business_type: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(UserBase):
    id: uuid.UUID
    is_active: bool
    onboarding_complete: bool

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
