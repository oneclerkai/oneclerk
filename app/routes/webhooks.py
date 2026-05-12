"""External webhook endpoints for Stripe, Telnyx voice, and WhatsApp."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import safe_db_operation
from app.models import Agent, Call, CallStatus, ConversationTurn, User
from app.services import ai_brain, synthesis, telnyx_handler, whatsapp
from app.services.redis_client import get_redis
from app.services.transcription import resolve_transcript
from app.tasks.background import process_completed_call

try:
    import stripe  # type: ignore
except ImportError:  # pragma: no cover
    stripe = None  # type: ignore[assignment]

try:
    import telnyx
    from telnyx.webhooks import Webhook
except ImportError:  # pragma: no cover
    telnyx = None  # type: ignore[assignment]
    Webhook = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


async def get_agent_by_telnyx_number(db: AsyncSession, to_number: str) -> Agent | None:
    result = await db.execute(
        select(Agent).where(
            (Agent.telnyx_phone == to_number) | (Agent.twilio_number == to_number)
        )
    )
    return result.scalar_one_or_none()


async def get_agent(db: AsyncSession, agent_id: str) -> Agent | None:
    return (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()


async def get_user(db: AsyncSession, user_id: str) -> User | None:
    return (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def get_call(db: AsyncSession, call_id: str) -> Call | None:
    return (await db.execute(select(Call).where(Call.id == call_id))).scalar_one_or_none()


async def get_conversation_history(db: AsyncSession, call_id: str) -> list[dict]:
    result = await db.execute(
        select(ConversationTurn)
        .where(ConversationTurn.call_id == call_id)
        .order_by(ConversationTurn.created_at)
    )
    turns = result.scalars().all()
    return [{"role": turn.role, "content": turn.content} for turn in turns]


async def check_call_limit(user: User, agent: Agent) -> bool:
    limits = {"trial": 50, "starter": 200, "growth": 500, "scale": 1000}
    plan = user.subscription_tier or user.plan or "trial"
    return agent.calls_this_month < limits.get(plan, 50)


def _plan_for_price(price_id: str) -> str | None:
    mapping = {
        settings.STRIPE_STARTER_PRICE_ID: "starter",
        settings.STRIPE_GROWTH_PRICE_ID: "growth",
        settings.STRIPE_SCALE_PRICE_ID: "scale",
    }
    return mapping.get(price_id)


@router.post("/telnyx")
async def handle_telnyx(request: Request) -> dict:
    if telnyx is not None:
        telnyx.api_key = settings.TELNYX_API_KEY
    body = await request.body()
    signature = request.headers.get("telnyx-signature-ed25519")
    timestamp = request.headers.get("telnyx-timestamp")
    if settings.TELNYX_PUBLIC_KEY and Webhook is not None:
        try:
            if hasattr(Webhook, "verify_signature"):
                Webhook.verify_signature(body, signature, timestamp, settings.TELNYX_PUBLIC_KEY)
            else:
                Webhook.construct_event(
                    payload=body.decode("utf-8"),
                    signature=signature or "",
                    timestamp=timestamp or "",
                    public_key=settings.TELNYX_PUBLIC_KEY,
                )
        except Exception:
            raise HTTPException(403, "Invalid signature")
    event = json.loads(body)
    event_type = event["data"]["event_type"]
    event_data = event["data"]["payload"]
    handlers = {
        "call.initiated": handle_call_initiated,
        "call.answered": handle_call_answered,
        "call.playback.ended": handle_playback_ended,
        "call.gather.ended": handle_gather_ended,
        "call.speak.ended": handle_speak_ended,
        "call.hangup": handle_call_hangup,
        "call.recording.saved": handle_recording_saved,
    }
    async with safe_db_operation() as db:
        handler = handlers.get(event_type)
        if handler:
            await handler(event_data, db)
    return {"status": "ok"}


async def handle_call_initiated(data: dict, db: AsyncSession):
    call_control_id = data["call_control_id"]
    from_number = data["from"]
    to_number = data["to"]
    telnyx_call_sid = data["call_leg_id"]

    # Anti-abuse: blacklist check
    from app.services.telnyx_handler import _is_blacklisted, _check_rate_limit
    if await _is_blacklisted(from_number):
        logger.warning("Rejected blacklisted caller %s", from_number)
        if telnyx is not None:
            telnyx.Call.reject(call_control_id)
        return

    agent = await get_agent_by_telnyx_number(db, to_number)
    if not agent or agent.status != "active":
        if telnyx is not None:
            telnyx.Call.reject(call_control_id)
        return
    user = await get_user(db, agent.user_id)
    if user is None:
        return

    # Anti-abuse: rate limit for trial plans
    plan = user.subscription_tier or user.plan or "trial"
    if not await _check_rate_limit(from_number, plan):
        await telnyx_handler.answer_and_say(
            call_control_id,
            "You have reached the call limit for this hour. Please try again later.",
            language=agent.language,
        )
        return

    if not await check_call_limit(user, agent):
        await telnyx_handler.answer_and_say(
            call_control_id,
            "This service is temporarily unavailable. Please try again later.",
            language=agent.language,
        )
        return
    call = Call(
        agent_id=agent.id,
        user_id=agent.user_id,
        telnyx_call_sid=telnyx_call_sid,
        call_sid=call_control_id,
        caller_number=from_number,
        status=CallStatus.in_progress.value,
        started_at=datetime.utcnow(),
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)
    redis_client = get_redis()
    if redis_client is not None:
        await redis_client.setex(
            f"call:{call_control_id}",
            3600,
            json.dumps({"call_id": str(call.id), "agent_id": str(agent.id)}),
        )
    if telnyx is not None:
        telnyx.Call.answer(call_control_id)


async def handle_call_answered(data: dict, db: AsyncSession):
    call_control_id = data["call_control_id"]
    redis_client = get_redis()
    if redis_client is None:
        return
    call_data_raw = await redis_client.get(f"call:{call_control_id}")
    if not call_data_raw:
        return
    call_data = json.loads(call_data_raw)
    agent = await get_agent(db, call_data["agent_id"])
    if agent is None:
        return
    # Stream greeting sentences for low latency
    first = True
    async for url in synthesis.synthesize_sentences(
        _build_greeting(agent),
        language=agent.language or "english",
        gender="female",
    ):
        if telnyx is not None:
            telnyx.Call.playback_start(
                call_control_id,
                audio_url=url,
                overlay=not first,
                loop=1,
                client_state="greeting_playing",
            )
        first = False
    if first:
        # No audio — fall back to gather immediately
        await handle_playback_ended(data, db)


def _build_greeting(agent: Agent) -> str:
    context = agent.config or {}
    business_name = context.get("business_name", agent.name)
    return (
        f"Thank you for calling {business_name}. "
        f"This call may be recorded for quality. "
        f"I'm {agent.name}, how can I help you today?"
    )


async def handle_playback_ended(data: dict, db: AsyncSession):
    call_control_id = data["call_control_id"]
    redis_client = get_redis()
    if redis_client is None:
        return
    call_data_raw = await redis_client.get(f"call:{call_control_id}")
    if not call_data_raw:
        return
    call_data = json.loads(call_data_raw)
    agent = await get_agent(db, call_data["agent_id"])
    if agent is None or telnyx is None:
        return
    language_map = {
        "english": "en-US",
        "hindi": "hi-IN",
        "arabic": "ar",
        "spanish": "es-419",
        "tamil": "ta-IN",
    }
    telnyx.Call.gather_using_speech(
        call_control_id,
        timeout_millis=8000,
        speech_timeout=1500,
        save_url=False,
        language=language_map.get((agent.language or "english").lower(), "en-US"),
        client_state="gathering_speech",
    )


async def handle_gather_ended(data: dict, db: AsyncSession):
    call_control_id = data["call_control_id"]
    speech_result = data.get("speech_result", {})
    transcription = speech_result.get("transcript", "")
    confidence = speech_result.get("confidence", 0)
    redis_client = get_redis()
    if redis_client is None:
        return
    call_data_raw = await redis_client.get(f"call:{call_control_id}")
    if not call_data_raw:
        return
    call_data = json.loads(call_data_raw)
    call = await get_call(db, call_data["call_id"])
    agent = await get_agent(db, call_data["agent_id"])
    if call is None or agent is None:
        return
    if confidence < 0.5 or not transcription:
        clarify_url = await synthesis.synthesize(
            "I'm sorry, I didn't catch that. Could you please repeat?",
            language=agent.language,
        )
        if telnyx is not None:
            telnyx.Call.playback_start(call_control_id, audio_url=clarify_url)
        return
    turn = ConversationTurn(call_id=call.id, role="user", content=transcription)
    db.add(turn)
    history = await get_conversation_history(db, call.id)
    ai_result = await ai_brain.get_ai_response(transcription, history, agent)
    response_text = ai_result.get("response", "I'll have someone call you back.")
    should_escalate = ai_result.get("escalate", False)
    booking_detected = ai_result.get("booking_detected", False)
    ai_turn = ConversationTurn(call_id=call.id, role="assistant", content=response_text)
    db.add(ai_turn)
    call.conversation = [*history, {"role": "user", "content": transcription}, {"role": "assistant", "content": response_text}]
    await db.commit()
    if should_escalate:
        call.escalated = True
        call.escalation_reason = "Emergency keywords detected"
        call.status = CallStatus.escalated.value
        await db.commit()
        asyncio.create_task(
            whatsapp.send_escalation_alert(
                (agent.config or {}).get("owner_whatsapp"),
                call.caller_number or "",
                "Emergency call in progress",
            )
        )
        escalate_url = await synthesis.synthesize(
            "I'm connecting you with someone right now. Please hold.",
            language=agent.language,
        )
        if telnyx is not None:
            telnyx.Call.playback_start(
                call_control_id,
                audio_url=escalate_url,
                client_state="escalating",
            )
        await asyncio.sleep(3)
        if telnyx is not None and agent.escalation_phone:
            telnyx.Call.transfer(call_control_id, to=agent.escalation_phone)
        return
    if booking_detected:
        call.appointment_booked = True
        await db.commit()
        asyncio.create_task(
            whatsapp.send_booking_link(
                call.caller_number or "",
                (agent.config or {}).get("business_name"),
                agent.name,
                (agent.config or {}).get("calendly_url"),
                ai_result.get("booking_service"),
            )
        )
    # Barge-in: stop any currently playing audio before responding
    if telnyx is not None:
        try:
            telnyx.Call.playback_stop(call_control_id)
        except Exception:
            pass

    # Stream response sentences for low latency
    first = True
    async for url in synthesis.synthesize_sentences(response_text, language=agent.language):
        if telnyx is not None:
            telnyx.Call.playback_start(
                call_control_id,
                audio_url=url,
                overlay=not first,
                client_state="response_playing",
            )
        first = False
    if first:
        # No audio generated — fall back to gather
        await handle_playback_ended(data, db)


async def handle_speak_ended(data: dict, db: AsyncSession):
    return await handle_playback_ended(data, db)


async def handle_call_hangup(data: dict, db: AsyncSession):
    call_control_id = data["call_control_id"]
    redis_client = get_redis()
    if redis_client is None:
        return
    call_data = await redis_client.get(f"call:{call_control_id}")
    if not call_data:
        return
    payload = json.loads(call_data)
    call = await get_call(db, payload["call_id"])
    if call is None:
        return
    call.status = CallStatus.completed.value
    call.ended_at = datetime.utcnow()
    call.duration_seconds = data.get("duration_secs", 0)
    await db.commit()
    await redis_client.delete(f"call:{call_control_id}")
    process_completed_call.delay(str(call.id))


async def handle_recording_saved(data: dict, db: AsyncSession):
    call_control_id = data.get("call_control_id")
    recording_url = data.get("recording_urls", {}).get("mp3") or data.get("recording_url")
    if not (call_control_id and recording_url):
        return
    redis_client = get_redis()
    if redis_client is None:
        return
    call_data_raw = await redis_client.get(f"call:{call_control_id}")
    if not call_data_raw:
        return
    call_data = json.loads(call_data_raw)
    call = await get_call(db, call_data["call_id"])
    agent = await get_agent(db, call_data["agent_id"])
    if call is None or agent is None:
        return
    transcript = await resolve_transcript(None, None, audio_url=recording_url, language=agent.language)
    if transcript:
        call.summary = transcript
        await db.commit()


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
            event = stripe.Webhook.construct_event(body, stripe_signature, settings.STRIPE_WEBHOOK_SECRET)
        except Exception as error:
            logger.warning("Stripe signature verification failed: %s", error)
            return {"received": False, "error": "signature"}
    else:
        try:
            event = stripe.Event.construct_from(await request.json(), stripe.api_key)
        except Exception:
            event = None
    if event is None:
        return {"received": True, "parsed": False}
    event_type = event.get("type") if isinstance(event, dict) else event.type
    data = ((event.get("data") or {}).get("object") if isinstance(event, dict) else event.data.object)
    async with safe_db_operation() as db:
        if event_type == "checkout.session.completed":
            user_id = (data.get("metadata") or {}).get("user_id")
            customer_id = data.get("customer")
            sub_id = data.get("subscription")
            plan = (data.get("metadata") or {}).get("plan")
            if user_id:
                user = await get_user(db, user_id)
                if user:
                    user.stripe_customer_id = customer_id or user.stripe_customer_id
                    user.stripe_subscription_id = sub_id or user.stripe_subscription_id
                    user.subscription_status = "active"
                    if plan:
                        user.plan = plan
                        user.subscription_tier = plan
                    await db.commit()
        elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
            customer_id = data.get("customer")
            status = data.get("status")
            items = ((data.get("items") or {}).get("data") or [])
            price_id = items[0]["price"]["id"] if items else None
            plan = _plan_for_price(price_id) if price_id else None
            user = (await db.execute(select(User).where(User.stripe_customer_id == customer_id))).scalar_one_or_none()
            if user:
                user.subscription_status = status
                if plan:
                    user.plan = plan
                    user.subscription_tier = plan
                await db.commit()
        elif event_type == "customer.subscription.deleted":
            customer_id = data.get("customer")
            user = (await db.execute(select(User).where(User.stripe_customer_id == customer_id))).scalar_one_or_none()
            if user:
                user.subscription_status = "canceled"
                user.plan = "trial"
                user.subscription_tier = "trial"
                await db.commit()
    return {"received": True, "type": event_type}


@router.post("/whatsapp")
async def whatsapp_inbound(request: Request) -> Response:
    payload = await request.json()
    sender = (payload.get("from") or "").strip()
    target = (payload.get("to") or "").strip()
    body = (payload.get("text") or payload.get("body") or "").strip()
    if not body:
        return Response(content='{"received": true}', media_type="application/json")
    async with safe_db_operation() as db:
        agent = None
        for column in (Agent.telnyx_phone, Agent.twilio_number, Agent.forwarding_number):
            result = await db.execute(select(Agent).where(column == target, Agent.is_active.is_(True)))
            agent = result.scalar_one_or_none()
            if agent:
                break
        if agent is None:
            result = await db.execute(select(Agent).where(Agent.is_active.is_(True)).order_by(desc(Agent.created_at)).limit(1))
            agent = result.scalar_one_or_none()
        if agent is None:
            return Response(content='{"received": true}', media_type="application/json")
        history_q = await db.execute(
            select(ConversationTurn)
            .where(
                ConversationTurn.caller_number == sender,
                ConversationTurn.agent_id == agent.id,
                ConversationTurn.source == "whatsapp",
            )
            .order_by(desc(ConversationTurn.created_at))
            .limit(10)
        )
        prior = list(reversed(history_q.scalars().all()))
        history = [{"role": turn.role, "content": turn.content} for turn in prior]
        reply_data = await ai_brain.get_ai_response(body, history, agent)
        reply = reply_data.get("response", "Thanks, we'll reply shortly.")
        db.add(ConversationTurn(role="user", content=body, source="whatsapp", caller_number=sender, agent_id=agent.id))
        db.add(ConversationTurn(role="assistant", content=reply, source="whatsapp", caller_number=sender, agent_id=agent.id))
        await db.commit()
    await whatsapp.send_text(sender, reply)
    return Response(content='{"received": true}', media_type="application/json")
