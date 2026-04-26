"""External webhook endpoints — Stripe events + Twilio WhatsApp inbound."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Header, Request
from fastapi.responses import Response
from sqlalchemy import desc, select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Agent, Conversation, User
from app.services.ai_brain import get_ai_response
from app.services.whatsapp import send_text

try:
    import stripe  # type: ignore
except ImportError:  # pragma: no cover
    stripe = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


PLAN_BY_PRICE = {
    # populated from settings at runtime
}


def _plan_for_price(price_id: str) -> str | None:
    mapping = {
        settings.STRIPE_STARTER_PRICE_ID: "starter",
        settings.STRIPE_GROWTH_PRICE_ID: "growth",
        settings.STRIPE_SCALE_PRICE_ID: "scale",
    }
    return mapping.get(price_id)


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> dict:
    body = await request.body()

    if stripe is None or not settings.STRIPE_SECRET_KEY:
        return {"received": True, "stripe_configured": False, "bytes": len(body)}

    stripe.api_key = settings.STRIPE_SECRET_KEY

    event = None
    if settings.STRIPE_WEBHOOK_SECRET and stripe_signature:
        try:
            event = stripe.Webhook.construct_event(
                body, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
            )
        except Exception as e:
            logger.warning("Stripe signature verification failed: %s", e)
            return {"received": False, "error": "signature"}
    else:
        try:
            event = stripe.Event.construct_from(await request.json(), stripe.api_key)
        except Exception:
            event = None

    if event is None:
        return {"received": True, "parsed": False}

    et = event.get("type") if isinstance(event, dict) else event.type
    data = (event.get("data") or {}).get("object") if isinstance(event, dict) else event.data.object  # type: ignore

    if AsyncSessionLocal is None:
        return {"received": True, "type": et, "db": "unconfigured"}

    async with AsyncSessionLocal() as db:
        if et == "checkout.session.completed":
            user_id = (data.get("metadata") or {}).get("user_id")
            customer_id = data.get("customer")
            sub_id = data.get("subscription")
            plan = (data.get("metadata") or {}).get("plan")
            if user_id:
                user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
                if user:
                    user.stripe_customer_id = customer_id or user.stripe_customer_id
                    user.stripe_subscription_id = sub_id or user.stripe_subscription_id
                    user.subscription_status = "active"
                    if plan:
                        user.plan = plan
                    await db.commit()
        elif et in ("customer.subscription.updated", "customer.subscription.created"):
            customer_id = data.get("customer")
            status = data.get("status")
            items = ((data.get("items") or {}).get("data") or [])
            price_id = items[0]["price"]["id"] if items else None
            plan = _plan_for_price(price_id) if price_id else None
            user = (await db.execute(
                select(User).where(User.stripe_customer_id == customer_id)
            )).scalar_one_or_none()
            if user:
                user.subscription_status = status
                if plan:
                    user.plan = plan
                await db.commit()
        elif et == "customer.subscription.deleted":
            customer_id = data.get("customer")
            user = (await db.execute(
                select(User).where(User.stripe_customer_id == customer_id)
            )).scalar_one_or_none()
            if user:
                user.subscription_status = "canceled"
                user.plan = "trial"
                await db.commit()

    return {"received": True, "type": et}


@router.post("/whatsapp")
async def whatsapp_inbound(request: Request) -> Response:
    """Twilio WhatsApp inbound webhook.

    Twilio posts form fields: From, To, Body. We match `To` to an agent's
    forwarding number, run the AI brain in WhatsApp mode, save both messages,
    and reply via Twilio. Always returns valid TwiML so Twilio is happy.
    """
    form = await request.form()
    sender = (form.get("From") or "").replace("whatsapp:", "").strip()
    target = (form.get("To") or "").replace("whatsapp:", "").strip()
    body = (form.get("Body") or "").strip()

    twiml_ok = '<?xml version="1.0" encoding="UTF-8"?><Response/>'

    if not body or AsyncSessionLocal is None:
        return Response(content=twiml_ok, media_type="application/xml")

    async with AsyncSessionLocal() as db:
        # Match agent by twilio_number first, then forwarding_number, else newest active.
        agent = None
        for column in (Agent.twilio_number, Agent.forwarding_number):
            r = await db.execute(select(Agent).where(column == target, Agent.is_active.is_(True)))
            agent = r.scalar_one_or_none()
            if agent:
                break
        if agent is None:
            r = await db.execute(
                select(Agent).where(Agent.is_active.is_(True)).order_by(desc(Agent.created_at)).limit(1)
            )
            agent = r.scalar_one_or_none()
        if agent is None:
            return Response(content=twiml_ok, media_type="application/xml")

        # Load last 10 turns for this caller via this agent
        history_q = await db.execute(
            select(Conversation)
            .where(
                Conversation.caller_number == sender,
                Conversation.agent_id == agent.id,
                Conversation.source == "whatsapp",
            )
            .order_by(desc(Conversation.created_at))
            .limit(10)
        )
        prior = list(reversed(history_q.scalars().all()))
        history = [{"role": p.role, "content": p.content} for p in prior]

        try:
            reply = await get_ai_response(history, agent.config or {}, body, channel="whatsapp")
        except Exception:
            logger.exception("AI brain failed on WhatsApp inbound")
            reply = "Thanks — we'll get back to you shortly."

        db.add(Conversation(role="user", content=body, source="whatsapp",
                            caller_number=sender, agent_id=agent.id))
        db.add(Conversation(role="assistant", content=reply, source="whatsapp",
                            caller_number=sender, agent_id=agent.id))
        await db.commit()

    await send_text(sender, reply)
    return Response(content=twiml_ok, media_type="application/xml")
