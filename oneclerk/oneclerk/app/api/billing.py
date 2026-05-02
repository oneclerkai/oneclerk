from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.config import settings
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional

router = APIRouter(prefix="/billing", tags=["billing"])

PLANS = {
    "starter": {
        "name": "Starter",
        "price_monthly": 39,
        "calls_limit": 200,
        "features": ["AI voice receptionist", "WhatsApp summaries", "Calendly bookings"],
    },
    "growth": {
        "name": "Growth",
        "price_monthly": 99,
        "calls_limit": 500,
        "features": ["AI voice receptionist", "WhatsApp summaries", "Calendly bookings", "Multi-language"],
    },
    "scale": {
        "name": "Scale",
        "price_monthly": 149,
        "calls_limit": 1000,
        "features": ["AI voice receptionist", "WhatsApp summaries", "Calendly bookings", "Multi-language", "Priority support"],
    },
}


class CheckoutBody(BaseModel):
    plan: str


@router.get("/plans")
async def get_plans():
    return {"plans": PLANS}


@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.id == current_user["sub"])
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    tier = user.subscription_tier.value if user.subscription_tier else "trial"
    plan_name = {"trial": "Free Trial", "starter": "Starter", "growth": "Growth", "scale": "Scale"}.get(tier, "Free Trial")

    trial_end = user.trial_ends_at
    if not trial_end and tier == "trial":
        trial_end = user.created_at + timedelta(days=7) if user.created_at else None

    stripe_ready = bool(settings.STRIPE_SECRET_KEY and settings.STRIPE_STARTER_PRICE_ID)

    return {
        "plan": tier,
        "plan_name": plan_name,
        "status": "active",
        "trial_ends_at": trial_end.isoformat() if trial_end else None,
        "stripe_customer_id": user.stripe_customer_id,
        "stripe_ready": stripe_ready,
        "calls_limit": PLANS.get(tier, {}).get("calls_limit", 50) if tier != "trial" else 50,
    }


@router.post("/create-checkout")
async def create_checkout(body: CheckoutBody, current_user: dict = Depends(get_current_user)):
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Stripe is not configured yet")
    price_ids = {
        "starter": settings.STRIPE_STARTER_PRICE_ID,
        "growth": settings.STRIPE_GROWTH_PRICE_ID,
        "scale": settings.STRIPE_SCALE_PRICE_ID,
    }
    price_id = price_ids.get(body.plan)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {body.plan}")

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{settings.FRONTEND_URL}/#/billing/success",
            cancel_url=f"{settings.FRONTEND_URL}/#/billing",
            metadata={"user_id": current_user["sub"], "plan": body.plan},
        )
        return {"checkout_url": session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-portal")
async def create_portal(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Stripe is not configured yet")

    stmt = select(User).where(User.id == current_user["sub"])
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No active subscription found")

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/#/billing",
        )
        return {"portal_url": session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
