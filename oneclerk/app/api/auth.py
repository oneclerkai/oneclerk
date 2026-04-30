from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserCreate, UserLogin, UserOut, Token
from app.utils.auth import get_password_hash, verify_password, create_access_token
from app.dependencies import get_current_user
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])


class OnboardingBody(BaseModel):
    profile: Optional[Dict[str, Any]] = {}
    completed: bool = True


@router.post("/signup", response_model=Token)
async def signup(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == user_in.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already in use")

    new_user = User(
        email=user_in.email,
        password_hash=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        business_name=user_in.business_name,
        business_type=user_in.business_type,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    access_token = create_access_token(data={"sub": str(new_user.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login", response_model=Token)
async def login(user_in: UserLogin, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == user_in.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(user_in.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.id == current_user["sub"])
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_out(user)


@router.post("/onboarding")
async def complete_onboarding(
    body: OnboardingBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(User.id == current_user["sub"])
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.completed:
        user.onboarding_complete = True
    if body.profile:
        if body.profile.get("business_name"):
            user.business_name = body.profile["business_name"]
        if body.profile.get("business_type"):
            pass
        if body.profile.get("phone"):
            user.phone_number = body.profile["phone"]
        if body.profile.get("whatsapp"):
            user.whatsapp_number = body.profile["whatsapp"]

    await db.commit()
    await db.refresh(user)
    return _user_out(user)


@router.post("/logout")
async def logout():
    return {"message": "Logged out"}


def _user_out(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "name": user.full_name,
        "business_name": user.business_name,
        "business_type": user.business_type,
        "phone_number": user.phone_number,
        "whatsapp_number": user.whatsapp_number,
        "subscription_tier": user.subscription_tier,
        "onboarding_complete": user.onboarding_complete,
        "onboarding_completed": user.onboarding_complete,
        "is_active": user.is_active,
        "total_minutes_used": user.total_minutes_used,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
