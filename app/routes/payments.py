"""Razorpay payment gateway — order creation and signature verification."""
from __future__ import annotations

import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.routes.auth import get_current_user

try:
    import razorpay  # type: ignore
except ImportError:
    razorpay = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])


def _razorpay_ready() -> bool:
    return (
        bool(settings.RAZORPAY_KEY_ID)
        and bool(settings.RAZORPAY_KEY_SECRET)
        and razorpay is not None
    )


def _client():
    if not _razorpay_ready():
        return None
    return razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
    )


class CreateOrderRequest(BaseModel):
    amount: int
    currency: str = "INR"
    plan: str = "starter"


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    plan: str = "starter"


@router.post("/create-order")
async def create_order(
    body: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    client = _client()
    if client is None:
        raise HTTPException(
            503,
            "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
        )
    if body.plan not in ("starter", "growth", "scale"):
        raise HTTPException(400, "Unknown plan. Must be starter, growth, or scale.")

    try:
        order = client.order.create(
            {
                "amount": body.amount * 100,
                "currency": body.currency,
                "receipt": f"harkly_{current_user.id}_{body.plan}",
                "notes": {
                    "user_id": str(current_user.id),
                    "plan": body.plan,
                    "email": current_user.email,
                },
            }
        )
        return {
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "key_id": settings.RAZORPAY_KEY_ID,
        }
    except Exception as exc:
        logger.exception("Razorpay create-order failed")
        raise HTTPException(502, f"Razorpay error: {exc}") from exc


@router.post("/verify")
async def verify_payment(
    body: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not _razorpay_ready():
        raise HTTPException(503, "Razorpay is not configured.")

    expected = hmac.new(
        (settings.RAZORPAY_KEY_SECRET or "").encode("utf-8"),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed.")

    PLAN_LIMITS = {
        "starter": {"calls_limit": 200, "minutes_included": 300},
        "growth":  {"calls_limit": 500, "minutes_included": 600},
        "scale":   {"calls_limit": 1000, "minutes_included": 1200},
    }
    plan = body.plan if body.plan in PLAN_LIMITS else "starter"

    try:
        current_user.plan = plan
        current_user.subscription_tier = plan
        current_user.subscription_status = "active"
        current_user.razorpay_payment_id = body.razorpay_payment_id
        current_user.razorpay_order_id = body.razorpay_order_id
        await db.commit()
        await db.refresh(current_user)
        return {
            "verified": True,
            "plan": plan,
            "payment_id": body.razorpay_payment_id,
        }
    except Exception as exc:
        await db.rollback()
        logger.exception("Failed to update subscription after Razorpay verification")
        raise HTTPException(500, f"Subscription update failed: {exc}") from exc
