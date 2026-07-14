from __future__ import annotations

import hmac
import hashlib
import logging
import os
from typing import Any

import httpx
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import safe_db_operation
from app.models import User
from app.routes.auth import _create_access_token
from app.services.crypto_utils import encrypt_value

router = APIRouter(prefix="/api/payments/razorpay", tags=["payments"])
logger = logging.getLogger(__name__)

try:
    import razorpay
except Exception:  # pragma: no cover - optional dependency in some environments
    razorpay = None


class CreateOrderRequest(BaseModel):
    amount: int  # amount in smallest currency unit (e.g., paise)
    currency: str = "INR"
    plan: str | None = None


@router.post("/create-order")
async def create_order(body: CreateOrderRequest, request: Request) -> dict:
    if razorpay is None:
        raise HTTPException(status_code=503, detail="Razorpay SDK not available")
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Razorpay not configured")

    # Identify current user via Authorization header if present
    token = None
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1]

    user_id = None
    if token:
        # try to decode via existing auth routines by verifying JWT manually
        try:
            from jose import jwt
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            user_id = payload.get("sub")
        except Exception:
            user_id = None

    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    order_data = {
        "amount": int(body.amount),
        "currency": body.currency,
        "payment_capture": 1,
        "notes": {"plan": body.plan or "", "user_id": user_id or ""},
    }
    try:
        order = client.order.create(order_data)
    except Exception as exc:
        logger.exception("Razorpay order creation failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"order": order}


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    if razorpay is None:
        raise HTTPException(status_code=503, detail="Razorpay SDK not available")
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Razorpay webhook secret not configured")

    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature")

    computed = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    # Razorpay provides signature in base64; compute and compare via HMAC SHA256
    # Some clients use different encoding; attempt direct compare of hexdigest vs signature
    if not hmac.compare_digest(computed, signature):
        # Try base64 compare
        import base64
        if not hmac.compare_digest(base64.b64encode(bytes.fromhex(computed)).decode(), signature):
            logger.warning("Razorpay webhook signature mismatch")
            raise HTTPException(status_code=400, detail="Invalid signature")

    payload = await request.json()
    event = payload.get("event")
    logger.info("Razorpay webhook event=%s", event)

    # Handle payment captured events
    if event in ("payment.captured", "order.paid"):
        # Extract order_id or payment and notes
        payload_obj = payload.get("payload", {})
        order_obj = payload_obj.get("order", {}) or {}
        order_entity = order_obj.get("entity", {})
        notes = order_entity.get("notes", {})
        user_id = notes.get("user_id")
        plan = notes.get("plan")

        # Update user plan if user exists
        if user_id:
            async with safe_db_operation() as db:  # type: AsyncSession
                result = await db.execute(__import__("sqlalchemy").select(User).where(User.id == user_id))
                user = result.scalar_one_or_none()
                if user:
                    if plan:
                        user.plan = plan
                        user.subscription_tier = plan
                        user.subscription_status = "active"
                    # Persist Razorpay info if available
                    # Try to extract payment id
                    payment_obj = payload_obj.get("payment", {})
                    payment_entity = payment_obj.get("entity", {})
                    payment_id = payment_entity.get("id")
                    order_id = order_entity.get("id") or order_entity.get("order_id")
                    if payment_id:
                        user.razorpay_payment_id = payment_id
                    if order_id:
                        user.razorpay_order_id = order_id
                    await db.commit()
    return {"ok": True}
