import json
import logging
from fastapi import APIRouter, Request, Header, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

_redis = None

def get_redis():
    global _redis
    if _redis is None:
        try:
            from redis import Redis
            _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2)
            _redis.ping()
        except Exception:
            _redis = None
    return _redis


@router.post("/telnyx")
async def telnyx_webhook(
    request: Request,
    x_telnyx_signature: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    payload = await request.json()
    event = payload.get("data", {})
    event_type = event.get("event_type")
    logger.info(f"Telnyx webhook: {event_type}")
    return {"status": "ok"}


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
    db: AsyncSession = Depends(get_db),
):
    if not settings.STRIPE_WEBHOOK_SECRET:
        return {"status": "skipped"}
    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        body = await request.body()
        event = stripe.Webhook.construct_event(body, stripe_signature, settings.STRIPE_WEBHOOK_SECRET)
        logger.info(f"Stripe event: {event['type']}")
    except Exception as e:
        logger.error(f"Stripe webhook error: {e}")
    return {"status": "ok"}
