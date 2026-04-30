import json
import logging
from fastapi import APIRouter, Request, Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from redis import Redis
from app.config import settings
from app.database import get_db
from app.models import Call, Agent, ConversationTurn, User
from app.services import telnyx_voice, synthesis, ai_brain, whatsapp, calendar_service
from sqlalchemy import select

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)
redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)

@router.post("/telnyx")
async def telnyx_webhook(
    request: Request,
    x_telnyx_signature: str = Header(None),
    db: AsyncSession = Depends(get_db)
):
    payload = await request.json()
    event = payload.get("data", {})
    event_type = event.get("event_type")
    
    # In production, verify Telnyx signature here
    
    if event_type == "call.initiated":
        await handle_call_initiated(event, db)
    elif event_type == "call.answered":
        await handle_call_answered(event, db)
    elif event_type == "call.playback.ended":
        await handle_playback_ended(event, db)
    elif event_type == "call.gather.ended":
        await handle_gather_ended(event, db)
    
    return {"status": "ok"}

async def handle_call_initiated(event, db: AsyncSession):
    payload = event.get("payload", {})
    call_control_id = payload.get("call_control_id")
    to_number = payload.get("to")
    from_number = payload.get("from")
    
    stmt = select(Agent).where(Agent.telnyx_phone == to_number)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    
    if not agent:
        logger.error(f"No agent found for phone {to_number}")
        return

    new_call = Call(
        agent_id=agent.id,
        user_id=agent.user_id,
        telnyx_call_sid=call_control_id,
        caller_number=from_number,
        status="in_progress"
    )
    db.add(new_call)
    await db.commit()
    
    redis_client.setex(f"call:{call_control_id}", 3600, json.dumps({
        "call_id": str(new_call.id),
        "agent_id": str(agent.id)
    }))
    
    await telnyx_voice.answer_call(call_control_id)

async def handle_call_answered(event, db: AsyncSession):
    payload = event.get("payload", {})
    call_control_id = payload.get("call_control_id")
    
    call_data = redis_client.get(f"call:{call_control_id}")
    if not call_data: return
    call_info = json.loads(call_data)
    
    stmt = select(Agent).where(Agent.id == call_info["agent_id"])
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    
    if not agent: return

    greeting = f"Hello, thank you for calling {agent.name}. How can I help you today?"
    filename = await synthesis.synthesize(greeting, agent.language)
    if filename:
        audio_url = synthesis.get_audio_url(filename)
        await telnyx_voice.play_audio(call_control_id, audio_url, client_state="greeting")

async def handle_playback_ended(event, db: AsyncSession):
    payload = event.get("payload", {})
    call_control_id = payload.get("call_control_id")
    
    call_data = redis_client.get(f"call:{call_control_id}")
    if not call_data: return
    call_info = json.loads(call_data)
    
    stmt = select(Agent).where(Agent.id == call_info["agent_id"])
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    
    lang_code = synthesis.TELNYX_LANGUAGE_CODES.get(agent.language, "en-US")
    await telnyx_voice.gather_speech(call_control_id, lang_code)

async def handle_gather_ended(event, db: AsyncSession):
    payload = event.get("payload", {})
    call_control_id = payload.get("call_control_id")
    transcript = payload.get("speech_results", {}).get("transcript", "")
    confidence = payload.get("speech_results", {}).get("confidence", 0)
    
    call_data = redis_client.get(f"call:{call_control_id}")
    if not call_data: return
    call_info = json.loads(call_data)

    if not transcript or confidence < 0.5:
        await telnyx_voice.play_audio(call_control_id, " ", client_state="retry_gather")
        return

    # Get Agent and User context
    stmt = select(Agent, User).join(User, Agent.user_id == User.id).where(Agent.id == call_info["agent_id"])
    result = await db.execute(stmt)
    row = result.first()
    if not row: return
    agent, user = row

    # Get conversation history from Redis
    history_key = f"history:{call_control_id}"
    history_raw = redis_client.get(history_key)
    history = json.loads(history_raw) if history_raw else []

    # Get AI response
    ai_resp = await ai_brain.get_ai_response(
        transcript, 
        history, 
        agent.business_context, 
        agent.name
    )
    
    # Update history
    history.append({"role": "user", "content": transcript})
    history.append({"role": "assistant", "content": ai_resp["response"]})
    redis_client.setex(history_key, 3600, json.dumps(history[-6:]))

    # Save turns to DB
    user_turn = ConversationTurn(call_id=call_info["call_id"], role="user", content=transcript)
    asst_turn = ConversationTurn(call_id=call_info["call_id"], role="assistant", content=ai_resp["response"])
    db.add_all([user_turn, asst_turn])
    
    # Update call status if needed
    call_stmt = select(Call).where(Call.id == call_info["call_id"])
    call_res = await db.execute(call_stmt)
    call_obj = call_res.scalar_one_or_none()

    if ai_resp.get("escalate") and agent.escalation_phone:
        if call_obj:
            call_obj.status = "escalated"
            call_obj.escalated = True
            call_obj.escalation_reason = ai_resp.get("escalation_reason")
        
        # WhatsApp Alert
        await whatsapp.send_escalation_alert(
            user.whatsapp_number or user.phone_number,
            call_obj.caller_number,
            ai_resp.get("escalation_reason")
        )
        # Transfer call
        await telnyx_voice.transfer_call(call_control_id, agent.escalation_phone)
        await db.commit()
        return

    if ai_resp.get("booking_detected") and user.google_refresh_token:
        if call_obj:
            call_obj.appointment_booked = True
            call_obj.appointment_details = {
                "service": ai_resp.get("booking_service"),
                "date": ai_resp.get("booking_date"),
                "time": ai_resp.get("booking_time")
            }
        
        # Create Google Calendar Event
        tokens = {"access_token": user.google_access_token, "refresh_token": user.google_refresh_token}
        await calendar_service.create_appointment(
            tokens,
            f"Appointment: {ai_resp.get('booking_service')}",
            f"{ai_resp.get('booking_date')}T{ai_resp.get('booking_time')}:00Z",
            f"{ai_resp.get('booking_date')}T{ai_resp.get('booking_time')}:30Z", # Assume 30 mins
            f"Booked by OneClerk for {call_obj.caller_number}"
        )
        
        # WhatsApp Confirmation
        await whatsapp.send_appointment_confirmation(
            call_obj.caller_number,
            user.business_name,
            agent.name,
            call_obj.appointment_details
        )

    await db.commit()
    
    # Speak response
    filename = await synthesis.synthesize(ai_resp["response"], ai_resp.get("detected_language", "english"))
    if filename:
        audio_url = synthesis.get_audio_url(filename)
        await telnyx_voice.play_audio(call_control_id, audio_url)
