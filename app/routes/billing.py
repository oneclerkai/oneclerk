"""Stripe billing — checkout sessions, customer portal, subscription status."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.routes.auth import get_current_user

try:
    import stripe  # type: ignore
except ImportError:  # pragma: no cover
    stripe = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


PLANS = {
    "starter": {"name": "Starter", "price_monthly": 39, "calls_limit": 200},
    "growth": {"name": "Growth", "price_monthly": 99, "calls_limit": 500},
    "scale": {"name": "Scale", "price_monthly": 149, "calls_limit": 1000},
}


def _price_id(plan: str) -> str | None:
    return {
        "starter": settings.STRIPE_STARTER_PRICE_ID,
        "growth": settings.STRIPE_GROWTH_PRICE_ID,
        "scale": settings.STRIPE_SCALE_PRICE_ID,
    }.get(plan)


def _stripe_ready() -> bool:
    return bool(settings.STRIPE_SECRET_KEY) and stripe is not None


def _client():
    if not _stripe_ready():
        return None
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


class CheckoutRequest(BaseModel):
    plan: str  # starter | growth | scale


@router.get("/plans")
async def list_plans() -> dict:
    return {"plans": PLANS}


@router.post("/create-checkout")
async def create_checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if body.plan not in PLANS:
        raise HTTPException(400, "Unknown plan")
    s = _client()
    if s is None:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY and price IDs.")
    price_id = _price_id(body.plan)
    if not price_id:
        raise HTTPException(503, f"Price ID not configured for {body.plan}")

    base = (settings.FRONTEND_URL or settings.PUBLIC_BASE_URL or "").rstrip("/") or "http://localhost:5000"
    success = f"{base}/app#/billing-success"
    cancel = f"{base}/app#/billing"

    try:
        if not current_user.stripe_customer_id:
            customer = s.Customer.create(email=current_user.email, name=current_user.name or None)
            current_user.stripe_customer_id = customer.id
            await db.commit()

        session = s.checkout.Session.create(
            customer=current_user.stripe_customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success,
            cancel_url=cancel,
            metadata={"user_id": str(current_user.id), "plan": body.plan},
            allow_promotion_codes=True,
        )
        return {"checkout_url": session.url}
    except Exception as e:
        logger.exception("Stripe checkout failed")
        raise HTTPException(502, f"Stripe error: {e}")


@router.post("/create-portal")
async def create_portal(
    current_user: User = Depends(get_current_user),
) -> dict:
    s = _client()
    if s is None:
        raise HTTPException(503, "Stripe is not configured.")
    if not current_user.stripe_customer_id:
        raise HTTPException(400, "No Stripe customer for this user yet.")
    base = (settings.FRONTEND_URL or settings.PUBLIC_BASE_URL or "").rstrip("/") or "http://localhost:5000"
    portal = s.billing_portal.Session.create(
        customer=current_user.stripe_customer_id,
        return_url=f"{base}/app#/billing",
    )
    return {"portal_url": portal.url}


@router.get("/status")
async def billing_status(
    current_user: User = Depends(get_current_user),
) -> dict:
    plan_key = current_user.plan or "trial"
    plan_info = PLANS.get(plan_key, {"name": "Trial", "calls_limit": 50, "price_monthly": 0})
    return {
        "plan": plan_key,
        "plan_name": plan_info.get("name", plan_key.title()),
        "status": current_user.subscription_status or ("trialing" if plan_key == "trial" else "active"),
        "calls_limit": plan_info.get("calls_limit"),
        "trial_ends_at": current_user.trial_ends_at.isoformat() if current_user.trial_ends_at else None,
        "stripe_customer_id": current_user.stripe_customer_id,
        "stripe_ready": _stripe_ready(),
    }
