"""Twilio webhook endpoints for the OneClerk call flow."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.twiml.voice_response import Gather, VoiceResponse

from app.database import get_db
from app.models import Agent, Call, User
from app.routes.auth import get_current_user
from app.services.ai_brain import detect_booking_intent, detect_urgency, get_ai_response
from app.services.booking import get_calendly_link
from app.services.voice_engine import AUDIO_DIR, synthesize_to_url
from app.services.whatsapp import send_booking_link, send_call_summary

router = APIRouter(prefix="/calls", tags=["calls"])


async def _say(gather_or_response, text: str, voice: str) -> None:
    """Speak `text` using ElevenLabs if available, else Polly."""
    url = await synthesize_to_url(text)
    if url:
        gather_or_response.play(url)
    else:
        gather_or_response.say(text, voice=voice)

CALL_ENDING_PHRASES = ("goodbye", "bye", "thank you", "that's all", "no that's it", "nothing else")


def _twiml(response: VoiceResponse) -> Response:
    return Response(content=str(response), media_type="application/xml")


@router.post("/incoming")
async def handle_incoming_call(
    CallSid: str = Form(...),
    From: str = Form(...),
    To: str = Form(...),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Twilio hits this when a forwarded call arrives at the OneClerk number."""
    # Try to find an agent that owns this Twilio number; otherwise use the
    # most-recently-active agent (useful when a single number serves all agents).
    result = await db.execute(
        select(Agent).where(Agent.twilio_number == To, Agent.is_active.is_(True))
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        result = await db.execute(
            select(Agent).where(Agent.is_active.is_(True)).order_by(desc(Agent.created_at)).limit(1)
        )
        agent = result.scalar_one_or_none()

    if agent is None:
        response = VoiceResponse()
        response.say("Thank you for calling. Please try again later.", voice="alice")
        return _twiml(response)

    call = Call(
        call_sid=CallSid,
        agent_id=agent.id,
        user_id=agent.user_id,
        caller_number=From,
        status="active",
        conversation=[],
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)

    cfg = agent.config or {}
    business_name = cfg.get("business_name", agent.name)
    greeting = (
        f"Hello! Thank you for calling {business_name}. "
        f"{cfg.get('greeting_message', 'How can I help you today?')}"
    )

    response = VoiceResponse()
    gather = Gather(
        input="speech",
        action=f"/calls/respond/{call.id}",
        speech_timeout="auto",
        language=agent.language or "en-IN",
        method="POST",
    )
    await _say(gather, greeting, agent.voice_id or "Polly.Aditi")
    response.append(gather)
    # If no input, repeat once then hang up.
    response.redirect(f"/calls/respond/{call.id}", method="POST")
    return _twiml(response)


@router.post("/respond/{call_id}")
async def handle_caller_speech(
    call_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    form = await request.form()
    speech_result = (form.get("SpeechResult") or "").strip()

    call = (await db.execute(select(Call).where(Call.id == call_id))).scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    agent = (await db.execute(select(Agent).where(Agent.id == call.agent_id))).scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    voice = agent.voice_id or "Polly.Aditi"
    language = agent.language or "en-IN"

    if not speech_result:
        response = VoiceResponse()
        gather = Gather(
            input="speech",
            action=f"/calls/respond/{call_id}",
            speech_timeout="auto",
            language=language,
            method="POST",
        )
        await _say(gather, "I didn't catch that. Could you please repeat?", voice)
        response.append(gather)
        response.hangup()
        return _twiml(response)

    conversation = list(call.conversation or [])
    ai_response = await get_ai_response(conversation, agent.config or {}, speech_result)

    is_urgent = await detect_urgency(speech_result)
    is_booking = await detect_booking_intent(speech_result)

    conversation.append({"role": "user", "content": speech_result})
    conversation.append({"role": "assistant", "content": ai_response})

    call.conversation = conversation
    if is_urgent:
        call.is_urgent = True
    if is_booking:
        call.booking_made = True
    await db.commit()

    cfg = agent.config or {}
    owner_whatsapp = cfg.get("owner_whatsapp", "")

    if is_urgent and owner_whatsapp:
        await send_call_summary(owner_whatsapp, call.caller_number or "", conversation, urgent=True)

    # If a booking intent was detected and we have a Calendly URL, send the
    # booking link to the caller via WhatsApp.
    calendly = get_calendly_link(cfg)
    if is_booking and call.caller_number:
        await send_booking_link(
            to_number=call.caller_number,
            business_name=cfg.get("business_name") or agent.name,
            agent_name=cfg.get("agent_name") or "OneClerk",
            calendly_url=calendly,
            service=cfg.get("services") or None,
        )

    response = VoiceResponse()
    if any(p in speech_result.lower() for p in CALL_ENDING_PHRASES):
        await _say(response, ai_response, voice)
        response.hangup()
        call.status = "completed"
        await db.commit()
        if owner_whatsapp:
            await send_call_summary(
                owner_whatsapp, call.caller_number or "", conversation, urgent=False
            )
    else:
        gather = Gather(
            input="speech",
            action=f"/calls/respond/{call_id}",
            speech_timeout="auto",
            language=language,
            method="POST",
        )
        await _say(gather, ai_response, voice)
        response.append(gather)
        response.redirect(f"/calls/respond/{call_id}", method="POST")
    return _twiml(response)


@router.get("/audio/{filename}", include_in_schema=False)
async def serve_audio(filename: str) -> FileResponse:
    """Serve a one-time-use ElevenLabs MP3 to Twilio's <Play>."""
    safe = Path(filename).name
    path = AUDIO_DIR / safe
    if not path.exists() or not safe.endswith(".mp3"):
        raise HTTPException(404, "audio not found")
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "no-cache"})


@router.post("/status")
async def call_status_webhook(
    CallSid: str = Form(...),
    CallStatus: str = Form(...),
    CallDuration: int | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if CallStatus in {"completed", "failed", "busy", "no-answer"}:
        result = await db.execute(select(Call).where(Call.call_sid == CallSid))
        call = result.scalar_one_or_none()
        if call:
            call.status = CallStatus
            if CallDuration is not None:
                call.duration_seconds = int(CallDuration)
            await db.commit()
    return {"status": "ok"}


@router.get("/recent")
async def recent_calls(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Call)
        .where(Call.user_id == current_user.id)
        .order_by(desc(Call.created_at))
        .limit(20)
    )
    calls = [
        {
            "id": c.id,
            "call_sid": c.call_sid,
            "agent_id": c.agent_id,
            "caller_number": c.caller_number,
            "duration_seconds": c.duration_seconds,
            "status": c.status,
            "is_urgent": c.is_urgent,
            "booking_made": c.booking_made,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in result.scalars().all()
    ]
    return {"calls": calls}


@router.get("/{call_id}")
async def get_call(
    call_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Call).where(Call.id == call_id, Call.user_id == current_user.id)
    )
    call = result.scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return {
        "id": call.id,
        "call_sid": call.call_sid,
        "agent_id": call.agent_id,
        "caller_number": call.caller_number,
        "duration_seconds": call.duration_seconds,
        "status": call.status,
        "is_urgent": call.is_urgent,
        "booking_made": call.booking_made,
        "booking_details": call.booking_details,
        "conversation": call.conversation or [],
        "created_at": call.created_at.isoformat() if call.created_at else None,
    }
