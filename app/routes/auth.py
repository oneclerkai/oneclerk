from datetime import datetime, timedelta
import logging
import re

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, field_validator
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)

BUSINESS_TYPES = [
    "Dental clinic",
    "Hair salon / spa",
    "Restaurant / café",
    "Medical clinic",
    "HVAC / home services",
    "Law firm",
    "Real estate",
    "Retail store",
    "Education / tutoring",
    "Other",
]

USER_ROLES = [
    "Owner / Founder",
    "Manager",
    "Receptionist",
    "Front desk staff",
    "Admin",
    "Other",
]


def _hash_password(password: str) -> str:
    raw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    raw = password.encode("utf-8")[:72]
    try:
        return bcrypt.checkpw(raw, hashed.encode("utf-8"))
    except ValueError:
        return False


def _create_access_token(subject: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _synthetic_email(username: str) -> str:
    return f"{username.lower()}@harkly.local"


def _user_dict(user: User) -> dict:
    profile = user.business_profile or {}
    return {
        "id": user.id,
        "username": user.username or user.name or "",
        "email": user.email,
        "name": user.name or user.username or "",
        "whatsapp_number": user.whatsapp_number,
        "plan": user.plan,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "onboarding_completed": bool(user.onboarding_completed),
        "email_verified": bool(user.email_verified),
        "phone_verified": bool(user.phone_verified),
        "business_profile": profile,
        "company_name": profile.get("company_name", ""),
        "business_type": profile.get("business_type", ""),
        "user_role": profile.get("user_role", ""),
    }


class SignupRequest(BaseModel):
    username: str
    email: str | None = None
    password: str
    company_name: str = ""
    business_type: str = ""
    user_role: str = ""

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Username is required")
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 40:
            raise ValueError("Username must be 40 characters or less")
        if not re.match(r"^[A-Za-z0-9_.\- ]+$", v):
            raise ValueError("Username can only contain letters, numbers, spaces, _, . and -")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 4:
            raise ValueError("Passcode must be at least 4 characters")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str
    email: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class OnboardingRequest(BaseModel):
    profile: dict
    completed: bool = True


@router.get("/options")
async def get_options() -> dict:
    return {"business_types": BUSINESS_TYPES, "user_roles": USER_ROLES}


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(data: SignupRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    username_clean = data.username.strip()

    existing = await db.execute(select(User).where(User.username == username_clean))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    real_email = data.email.strip().lower() if data.email and data.email.strip() else None
    final_email = real_email if real_email else _synthetic_email(username_clean)

    email_taken = await db.execute(select(User).where(User.email == final_email))
    if email_taken.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Email already in use" if real_email else "Username already taken",
        )

    profile: dict = {}
    if data.company_name:
        profile["company_name"] = data.company_name
    if data.business_type:
        profile["business_type"] = data.business_type
    if data.user_role:
        profile["user_role"] = data.user_role

    user = User(
        username=username_clean,
        email=final_email,
        hashed_password=_hash_password(data.password),
        name=username_clean,
        email_verified=bool(real_email),
        onboarding_completed=bool(profile),
        business_profile=profile if profile else None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=_create_access_token(user.id), user=_user_dict(user))


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    username = data.username.strip()
    result = await db.execute(
        select(User).where(or_(User.username == username, User.email == username))
    )
    user = result.scalar_one_or_none()
    if not user or not _verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Wrong username or passcode")
    return TokenResponse(access_token=_create_access_token(user.id), user=_user_dict(user))


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id: str | None = payload.get("sub")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)) -> dict:
    return _user_dict(current_user)


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    whatsapp_number: str | None = None
    timezone: str | None = None


@router.put("/profile")
async def update_profile(
    data: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if data.name is not None:
        current_user.name = data.name.strip() or current_user.name
    if data.whatsapp_number is not None:
        current_user.whatsapp_number = data.whatsapp_number.strip() or None
    if data.timezone is not None:
        profile = dict(current_user.business_profile or {})
        profile["timezone"] = data.timezone
        current_user.business_profile = profile
        flag_modified(current_user, "business_profile")
    await db.commit()
    await db.refresh(current_user)
    return {"user": _user_dict(current_user)}


@router.post("/onboarding")
async def save_onboarding(
    data: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    current_user.business_profile = data.profile
    current_user.onboarding_completed = data.completed
    if data.profile.get("business_name") and not current_user.name:
        current_user.name = data.profile.get("contact_name") or current_user.name
    if data.profile.get("whatsapp_number") and not current_user.whatsapp_number:
        current_user.whatsapp_number = data.profile.get("whatsapp_number")
    await db.commit()
    await db.refresh(current_user)
    return _user_dict(current_user)
