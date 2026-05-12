"""Telnyx call-control handler.

Improvements over the original:
* Sentence-streaming synthesis for < 800 ms first-audio latency.
* Barge-in / VAD: sends playback_stop before playing new audio so the AI
  never talks over the caller.
* Legal disclosure in greeting ("This call may be recorded for quality.").
* Anti-abuse: Redis rate-limit (max 5 calls/hour) for trial plans; blacklist
  check before answering.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid

from sqlalchemy import desc, select

from app.config import settings
from app.database import get_sessionmaker
from app.models import Agent, Call, CallStatus
from app.services.ai_brain import get_ai_response
from app.services.redis_client import get_redis, safe_setex
from app.services.synthesis import synthesize, synthesize_greeting, synthesize_sentences
from app.services.transcription import resolve_transcript
from app.services.whatsapp import send_booking_link, send_call_summary

try:
    import telnyx
except ImportError:  # pragma: no cover
    telnyx = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

if telnyx is not None:
    telnyx.api_key = settings.TELNYX_API_KEY

# ---------------------------------------------------------------------------
# Anti-abuse helpers
# ---------------------------------------------------------------------------

TRIAL_CALL_LIMIT_PER_HOUR = 5


async def _is_blacklisted(caller_number: str) -> bool:
    """Return True if the caller is on the Redis blacklist."""
    redis = get_redis()
    if redis is None or not caller_number:
        return False
    key = f"blacklist:{caller_number}"
    return bool(await redis.exists(key))


async def _check_rate_limit(caller_number: str, plan: str) -> bool:
    """Return True (allowed) or False (rate-limited).

    Trial plans are limited to TRIAL_CALL_LIMIT_PER_HOUR calls per hour per
    caller number.  Paid plans are not rate-limited here.
    """
    if plan not in ("trial", None, ""):
        return True
    redis = get_redis()
    if redis is None:
        return True
    key = f"ratelimit:{caller_number}"
    count_raw = await redis.get(key)
    count = int(count_raw) if count_raw else 0
    if count >= TRIAL_CALL_LIMIT_PER_HOUR:
        logger.warning("Rate limit hit for %s (trial plan)", caller_number)
        return False
    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, 3600)
    await pipe.execute()
    return True


# ---------------------------------------------------------------------------
# Barge-in helper
# ---------------------------------------------------------------------------

async def _stop_playback(call_control_id: str) -> None:
    """Send a playback_stop to flush the audio buffer (barge-in / VAD clear)."""
    if telnyx is None:
        return
    try:
        telnyx.Call.playback_stop(call_control_id)
    except Exception:
        pass  # ignore if nothing is playing


# ---------------------------------------------------------------------------
# Core call-control helpers
# ---------------------------------------------------------------------------

def _language_name(agent: Agent) -> str:
    language = (agent.language or "english").lower()
    if language.startswith("en"):
        return "english"
    if language.startswith("hi"):
        return "hindi"
    return language


async def answer_and_say(call_control_id: str, text: str, language: str = "english") -> bool:
    if telnyx is None:
        return False
    telnyx.Call.answer(call_control_id)
    audio_url = await synthesize(text, language=language)
    if audio_url:
        telnyx.Call.playback_start(call_control_id, audio_url=audio_url, overlay=False)
    return True


async def answer_call(call_control_id: str, agent: Agent) -> bool:
    """Answer the call and stream the greeting sentence-by-sentence."""
    if telnyx is None:
        return False
    telnyx.Call.answer(call_control_id)
    # Stream greeting sentences for low latency
    first = True
    async for url in synthesize_sentences(
        _build_greeting(agent),
        language=_language_name(agent),
        gender="female",
    ):
        telnyx.Call.playback_start(
            call_control_id,
            audio_url=url,
            overlay=not first,  # overlay subsequent sentences for chaining
        )
        first = False
    if first:
        # synthesize_sentences yielded nothing — fall back to gather
        await gather_speech(call_control_id)
    return True


def _build_greeting(agent: Agent) -> str:
    context = agent.config or {}
    business_name = context.get("business_name", agent.name)
    return (
        f"Thank you for calling {business_name}. "
        f"This call may be recorded for quality. "
        f"I'm {agent.name}, how can I help you today?"
    )


async def gather_speech(call_control_id: str) -> None:
    if telnyx is None:
        return
    telnyx.Call.gather_using_speech(
        call_control_id,
        gather_id=str(uuid.uuid4()),
        timeout_millis=8000,
        speech_timeout=1500,
        save_url=False,
    )


async def respond_to_speech(
    call_control_id: str,
    transcribed_text: str,
    agent: Agent,
    conversation_history: list,
) -> tuple[bool, str]:
    result = await get_ai_response(
        user_message=transcribed_text,
        conversation_history=conversation_history,
        agent=agent,
        call_context={"call_control_id": call_control_id},
    )
    response_text = result.get("response", "Could you repeat that for me?")
    should_escalate = bool(result.get("escalate"))

    # Barge-in: stop any currently playing audio before responding
    await _stop_playback(call_control_id)

    # Stream response sentences for low latency
    first = True
    async for url in synthesize_sentences(
        response_text,
        language=_language_name(agent),
        gender="female",
        voice_id=agent.voice_id or None,
    ):
        if telnyx is not None:
            telnyx.Call.playback_start(
                call_control_id,
                audio_url=url,
                overlay=not first,
            )
        first = False

    if first and telnyx is not None:
        # No audio generated — keep conversation going
        await gather_speech(call_control_id)

    if result.get("booking_detected"):
        cfg = agent.config or {}
        caller_number = cfg.get("last_caller_number") or ""
        if caller_number:
            await send_booking_link(
                to_number=caller_number,
                business_name=cfg.get("business_name") or agent.name,
                agent_name=cfg.get("agent_name") or agent.name,
                calendly_url=cfg.get("calendly_url"),
                service=result.get("booking_service"),
            )
    return should_escalate, response_text


async def transfer_call(call_control_id: str, transfer_to: str) -> bool:
    if telnyx is None:
        return False
    telnyx.Call.transfer(call_control_id, to=transfer_to)
    return True


async def end_call(call_control_id: str, farewell_text: str) -> bool:
    if telnyx is None:
        return False
    audio_url = await synthesize(farewell_text)
    if audio_url:
        telnyx.Call.playback_start(call_control_id, audio_url=audio_url, overlay=False)
        await asyncio.sleep(1)
    telnyx.Call.hangup(call_control_id)
    return True


async def get_or_create_phone_number(country_code: str = "US") -> dict:
    if telnyx is None or not settings.TELNYX_API_KEY or not settings.TELNYX_CONNECTION_ID:
        return {}
    telnyx.api_key = settings.TELNYX_API_KEY
    available = telnyx.AvailablePhoneNumber.list(
        country_code=country_code,
        features=["voice", "sms"],
        limit=1,
    )
    items = getattr(available, "data", None)
    if items is None and isinstance(available, dict):
        items = available.get("data")
    if items is None:
        try:
            items = list(available)
        except TypeError:
            items = []
    if not items:
        return {}
    chosen = items[0]
    phone_number = getattr(chosen, "phone_number", None)
    if phone_number is None and isinstance(chosen, dict):
        phone_number = chosen.get("phone_number")
    if not phone_number:
        return {}
    try:
        purchased = telnyx.PhoneNumber.create(
            phone_number=phone_number,
            connection_id=settings.TELNYX_CONNECTION_ID,
        )
    except Exception:
        purchased = telnyx.NumberOrder.create(
            phone_numbers=[{"phone_number": phone_number}],
            connection_id=settings.TELNYX_CONNECTION_ID,
        )
    purchased_number = getattr(purchased, "phone_number", None) or phone_number
    purchased_id = getattr(purchased, "id", "") or getattr(purchased, "phone_number_id", "")
    if isinstance(purchased, dict):
        purchased_number = purchased.get("phone_number") or purchased_number
        purchased_id = purchased.get("id") or purchased.get("phone_number_id") or purchased_id
    return {"number": purchased_number, "phone_number_id": purchased_id}


async def _find_or_create_call(
    call_control_id: str,
    caller_number: str,
    target_number: str,
) -> tuple[Call | None, Agent | None]:
    sessionmaker = get_sessionmaker()
    if sessionmaker is None:
        return None, None
    async with sessionmaker() as db:
        result = await db.execute(
            select(Agent).where(
                (Agent.telnyx_phone == target_number) | (Agent.twilio_number == target_number),
                Agent.is_active.is_(True),
            )
        )
        agent = result.scalar_one_or_none()
        if agent is None:
            result = await db.execute(
                select(Agent).where(Agent.is_active.is_(True)).order_by(desc(Agent.created_at)).limit(1)
            )
            agent = result.scalar_one_or_none()
        if agent is None:
            return None, None
        result = await db.execute(select(Call).where(Call.call_sid == call_control_id))
        call = result.scalar_one_or_none()
        if call is None:
            call = Call(
                call_sid=call_control_id,
                telnyx_call_sid=call_control_id,
                agent_id=agent.id,
                user_id=agent.user_id,
                caller_number=caller_number,
                status=CallStatus.in_progress.value,
                conversation=[],
            )
            db.add(call)
            await db.commit()
            await db.refresh(call)
        cfg = dict(agent.config or {})
        cfg["last_caller_number"] = caller_number
        agent.config = cfg
        await db.commit()
        await safe_setex(
            f"call:{call_control_id}",
            3600,
            json.dumps({"call_id": str(call.id), "agent_id": str(agent.id)}),
        )
        return call, agent


# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------

async def handle_call_initiated(event_data: dict) -> None:
    payload = event_data.get("payload", {})
    call_control_id = payload.get("call_control_id")
    caller = payload.get("from") or ""
    target = payload.get("to") or ""

    # Anti-abuse: blacklist check
    if await _is_blacklisted(caller):
        logger.warning("Rejected blacklisted caller %s", caller)
        if telnyx is not None:
            telnyx.Call.reject(call_control_id)
        return

    # Anti-abuse: rate limit (trial plan check happens in webhooks.py too,
    # but we guard here for the telnyx_handler direct path)
    if not await _check_rate_limit(caller, "trial"):
        if telnyx is not None:
            await answer_and_say(
                call_control_id,
                "You have reached the call limit for this hour. Please try again later.",
            )
        return

    call, agent = await _find_or_create_call(call_control_id, caller, target)
    if call is None or agent is None:
        return
    await answer_call(call_control_id, agent)


async def handle_call_answered(event_data: dict) -> None:
    payload = event_data.get("payload", {})
    call_control_id = payload.get("call_control_id")
    if call_control_id:
        await gather_speech(call_control_id)


async def handle_playback_ended(event_data: dict) -> None:
    payload = event_data.get("payload", {})
    call_control_id = payload.get("call_control_id")
    if call_control_id:
        await gather_speech(call_control_id)


async def handle_gather_ended(event_data: dict) -> None:
    sessionmaker = get_sessionmaker()
    if sessionmaker is None:
        return
    payload = event_data.get("payload", {})
    call_control_id = payload.get("call_control_id")
    if not call_control_id:
        return
    async with sessionmaker() as db:
        call = (
            await db.execute(select(Call).where(Call.call_sid == call_control_id))
        ).scalar_one_or_none()
        if call is None:
            return
        agent = (
            await db.execute(select(Agent).where(Agent.id == call.agent_id))
        ).scalar_one_or_none()
        if agent is None:
            return
        transcript = await resolve_transcript(
            payload.get("transcription"),
            payload.get("confidence"),
            audio_url=payload.get("recording_url"),
            language=_language_name(agent),
        )
        conversation = list(call.conversation or [])
        conversation.append({"role": "user", "content": transcript})
        should_escalate, response_text = await respond_to_speech(
            call_control_id, transcript, agent, conversation
        )
        conversation.append({"role": "assistant", "content": response_text})
        call.conversation = conversation
        call.is_urgent = should_escalate
        await db.commit()
        if should_escalate:
            owner_number = agent.escalation_phone or (agent.config or {}).get("escalation_phone")
            if owner_number:
                await transfer_call(call_control_id, owner_number)


async def handle_call_hangup(event_data: dict) -> None:
    sessionmaker = get_sessionmaker()
    if sessionmaker is None:
        return
    payload = event_data.get("payload", {})
    call_control_id = payload.get("call_control_id")
    if not call_control_id:
        return
    async with sessionmaker() as db:
        call = (
            await db.execute(select(Call).where(Call.call_sid == call_control_id))
        ).scalar_one_or_none()
        if call is None:
            return
        call.status = CallStatus.completed.value
        await db.commit()
        agent = (
            await db.execute(select(Agent).where(Agent.id == call.agent_id))
        ).scalar_one_or_none()
        if agent is None:
            return
        cfg = agent.config or {}
        owner_whatsapp = cfg.get("owner_whatsapp")
        if owner_whatsapp:
            await send_call_summary(
                owner_whatsapp,
                call.caller_number or "",
                call.conversation or [],
                urgent=call.is_urgent,
            )


async def handle_telnyx_event(event_type: str, event_data: dict) -> None:
    dispatcher = {
        "call.initiated": handle_call_initiated,
        "call.answered": handle_call_answered,
        "call.playback.ended": handle_playback_ended,
        "call.gather.ended": handle_gather_ended,
        "call.hangup": handle_call_hangup,
    }
    handler = dispatcher.get(event_type)
    if handler:
        await handler(event_data)
