from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.database import get_db
from app.models import Agent, Call, User
from app.routes.auth import get_current_user
from app.services.ai_brain import get_ai_response
from app.services.booking import get_calendly_link
from app.services.forwarding import get_forwarding_instructions
from app.services.telnyx_handler import get_or_create_phone_number

try:
    import telnyx
except ImportError:  # pragma: no cover
    telnyx = None  # type: ignore[assignment]

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentConfig(BaseModel):
    business_name: str = ""
    business_type: str = ""
    agent_name: str = "OneClerk"
    greeting_message: str = "How can I help you today?"
    operating_hours: str = ""
    services: str = ""
    location: str = ""
    pricing: str = ""
    faqs: str = ""
    booking_instructions: str = ""
    escalation_triggers: str = "emergency, urgent, immediate, right now"
    owner_name: str = ""
    owner_whatsapp: str = ""
    language: str = "English"
    calendly_url: str = ""
    google_credentials: dict[str, Any] | None = None
    google_calendar_connected: bool = False
    gmail_connected: bool = False
    # Business info from canvas info card
    business_info: str = ""
    business_url: str = ""
    # Visual flow builder data: { nodes: [...], edges: [...] }
    flow: dict[str, Any] | None = None
    builder_layout: dict[str, Any] | None = None
    # Drag-and-drop canvas (Agent Flow Builder) — cards + edges
    flow_v2: dict[str, Any] | None = None

    class Config:
        extra = "allow"  # preserve any extra keys the frontend sets


class CreateAgentRequest(BaseModel):
    name: str
    config: AgentConfig
    forwarding_number: str | None = None
    twilio_number: str | None = None
    voice_id: str | None = None
    language: str | None = None


class TestChatRequest(BaseModel):
    message: str
    history: list[dict] = []


def _connection_status(agent: Agent) -> dict:
    cfg = agent.config or {}
    return {
        "phone": bool(agent.telnyx_phone or agent.twilio_number or cfg.get("owner_whatsapp")),
        "whatsapp": bool(cfg.get("owner_whatsapp")),
        "ai_brain": bool(settings.OPENAI_API_KEY),
        "voice": bool(settings.ELEVENLABS_API_KEY),
        "telnyx": bool(settings.TELNYX_API_KEY and settings.TELNYX_PUBLIC_KEY),
        "booking": bool(cfg.get("calendly_url") or cfg.get("google_credentials")),
        "google_calendar": bool(cfg.get("google_credentials")),
        "gmail": bool(cfg.get("google_credentials")),
        "flow_configured": bool((cfg.get("flow") or {}).get("nodes")),
    }


def _missing_activation_requirements(agent: Agent) -> list[str]:
    """Return a list of field keys that must be present before activation.
    Accepts any of: telnyx_phone, twilio_number, or forwarding_number.
    """
    missing: list[str] = []
    has_phone = bool(
        str(agent.telnyx_phone or "").strip()
        or str(agent.twilio_number or "").strip()
        or str(agent.forwarding_number or "").strip()
    )
    if not has_phone:
        missing.append("phone_number")
    return missing


def _agent_dict(agent: Agent) -> dict:
    return {
        "id": agent.id,
        "user_id": agent.user_id,
        "name": agent.name,
        "twilio_number": agent.twilio_number,
        "telnyx_phone": agent.telnyx_phone,
        "telnyx_phone_sid": agent.telnyx_phone_sid,
        "forwarding_number": agent.forwarding_number,
        "is_active": agent.is_active,
        "status": agent.status,
        "config": agent.config or {},
        "voice_id": agent.voice_id,
        "language": agent.language,
        "calls_this_month": agent.calls_this_month,
        "total_calls": agent.total_calls,
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
        "connection_status": _connection_status(agent),
        "activation_missing": _missing_activation_requirements(agent),
    }


def _normalize_agent_config(config: dict[str, Any] | None) -> dict[str, Any]:
    cfg = config.copy() if isinstance(config, dict) else {}
    # flow_v2 (drag-and-drop canvas cards) → also populate legacy `flow` field
    if cfg.get("flow_v2") and cfg.get("flow") is None:
        cfg["flow"] = cfg["flow_v2"]
    if cfg.get("builder_layout") and cfg.get("flow") is None:
        cfg["flow"] = cfg["builder_layout"]
    if cfg.get("google_credentials"):
        cfg["google_calendar_connected"] = True
        cfg["gmail_connected"] = True
    return cfg


@router.post("/create", status_code=201)
async def create_agent(
    data: CreateAgentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = Agent(
        user_id=current_user.id,
        name=data.name,
        forwarding_number=data.forwarding_number,
        twilio_number=data.twilio_number,
        config=_normalize_agent_config(data.config.model_dump()),
        voice_id=data.voice_id or settings.VOICE_EN_FEMALE,
        language=data.language or "english",
        is_active=False,
        status="draft",
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return {"agent": _agent_dict(agent), "next_step": "connect_phone"}


@router.get("/list")
async def list_agents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Agent).where(Agent.user_id == current_user.id).order_by(desc(Agent.created_at))
    )
    return {"agents": [_agent_dict(a) for a in result.scalars().all()]}


async def _get_owned_agent(db: AsyncSession, user: User, agent_id: str) -> Agent:
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.user_id == user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.put("/{agent_id}")
async def update_agent(
    agent_id: str,
    data: CreateAgentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    agent.name = data.name
    agent.config = _normalize_agent_config(data.config.model_dump())
    flag_modified(agent, "config")
    if data.forwarding_number is not None:
        agent.forwarding_number = data.forwarding_number
    if data.twilio_number is not None:
        agent.twilio_number = data.twilio_number
    if data.voice_id is not None:
        agent.voice_id = data.voice_id
    if data.language is not None:
        agent.language = data.language
    await db.commit()
    await db.refresh(agent)
    return {"agent": _agent_dict(agent)}


@router.post("/{agent_id}/activate")
async def activate_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    missing = _missing_activation_requirements(agent)
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Agent cannot go live yet. Add the required setup fields first.",
                "missing": missing,
            },
        )
    agent.is_active = True
    agent.status = "active"
    await db.commit()
    return {
        "status": "active",
        "instructions": (
            "Set call forwarding on your phone to forward unanswered calls to "
            "our handling number. Your agent is now live."
        ),
    }


@router.post("/{agent_id}/deactivate")
async def deactivate_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    agent.is_active = False
    agent.status = "paused"
    await db.commit()
    return {"status": "paused"}


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    agent = await _get_owned_agent(db, current_user, agent_id)
    if agent.telnyx_phone_sid and telnyx is not None and settings.TELNYX_API_KEY:
        telnyx.api_key = settings.TELNYX_API_KEY
        try:
            telnyx.PhoneNumber.delete(agent.telnyx_phone_sid)
        except Exception:
            pass
    await db.delete(agent)
    await db.commit()
    return None


@router.get("/{agent_id}/setup-instructions")
async def setup_instructions(
    agent_id: str,
    carrier: str = "generic",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    if not (agent.telnyx_phone or agent.twilio_number):
        raise HTTPException(400, "Set a Telnyx phone number on this agent first.")
    return get_forwarding_instructions(agent.telnyx_phone or agent.twilio_number, carrier=carrier)


@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    return {"agent": _agent_dict(agent)}


class GoogleCalendarConnectRequest(BaseModel):
    credentials: dict[str, Any]
    calendar_id: str | None = "primary"


async def _verify_google_calendar_credentials(credentials: dict[str, Any]) -> dict[str, Any]:
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Google API dependencies are not installed. Install google-api-python-client and google-auth.",
        ) from exc

    if not credentials.get("token"):
        raise HTTPException(status_code=400, detail="Google credentials must include an access token")

    creds = Credentials(**credentials)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    result = service.calendarList().list(maxResults=1).execute()
    calendars = result.get("items", [])
    return {"verified": True, "calendar_id": calendars[0].get("id") if calendars else "primary"}


@router.post("/{agent_id}/google-calendar/connect")
async def connect_google_calendar(
    agent_id: str,
    data: GoogleCalendarConnectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    cfg = agent.config or {}
    cfg["google_credentials"] = data.credentials
    cfg["google_calendar_id"] = data.calendar_id or "primary"
    cfg["google_calendar_connected"] = True
    cfg["gmail_connected"] = True
    cfg = _normalize_agent_config(cfg)
    agent.config = cfg
    flag_modified(agent, "config")
    await db.commit()
    await db.refresh(agent)
    return {"agent": _agent_dict(agent)}


@router.post("/{agent_id}/google-calendar/verify")
async def verify_google_calendar(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    cfg = agent.config or {}
    credentials = cfg.get("google_credentials")
    if not credentials:
        raise HTTPException(status_code=400, detail="Google Calendar is not configured for this agent")
    result = await _verify_google_calendar_credentials(credentials)
    return {"verified": True, "calendar_id": result["calendar_id"]}


@router.post("/{agent_id}/test-chat")
async def test_chat(
    agent_id: str,
    data: TestChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send a text message to the agent and get a reply — for testing the flow
    without needing a real phone call. Uses the same AI brain the voice loop uses.
    """
    agent = await _get_owned_agent(db, current_user, agent_id)
    reply = await get_ai_response(
        user_message=data.message,
        conversation_history=data.history,
        agent=agent,
        call_context={"channel": "voice"},
    )
    return {"reply": reply.get("response", "")}


class PreviewRequest(BaseModel):
    text: str


@router.post("/{agent_id}/preview")
async def preview_agent_audio(
    agent_id: str,
    data: PreviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Synthesize a short preview audio clip for the agent and return a public URL.

    This endpoint is intended for dashboard preview playback; it uses the same
    synthesis service the live telephony loop uses and caches hot audio.
    """
    agent = await _get_owned_agent(db, current_user, agent_id)
    from app.services.synthesis import synthesize

    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Preview text required")
    url = await synthesize(text, language=(agent.language or "english"), gender="female", voice_id=agent.voice_id or None)
    if not url:
        raise HTTPException(status_code=503, detail="Synthesis service not available")
    return {"audio_url": url}


@router.get("/{agent_id}/calls")
async def get_agent_calls(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _get_owned_agent(db, current_user, agent_id)
    result = await db.execute(
        select(Call).where(Call.agent_id == agent_id).order_by(desc(Call.created_at)).limit(50)
    )
    calls = [
        {
            "id": c.id,
            "call_sid": c.call_sid,
            "caller_number": c.caller_number,
            "duration_seconds": c.duration_seconds,
            "status": c.status,
            "is_urgent": c.is_urgent,
            "booking_made": c.booking_made,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "conversation": c.conversation or [],
        }
        for c in result.scalars().all()
    ]
    return {"calls": calls}


@router.post("/{agent_id}/get-telnyx-number")
async def provision_telnyx_number(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    if not settings.TELNYX_API_KEY or not settings.TELNYX_CONNECTION_ID:
        raise HTTPException(
            status_code=503,
            detail="Telnyx is not configured. Set TELNYX_API_KEY and TELNYX_CONNECTION_ID.",
        )
    tier_limits = {"trial": 1, "starter": 1, "growth": 3, "scale": 10}
    plan = current_user.subscription_tier or current_user.plan or "trial"
    limit = tier_limits.get(plan, 1)
    existing_agents_with_numbers = (
        await db.execute(
            select(Agent).where(Agent.user_id == current_user.id, Agent.telnyx_phone.is_not(None))
        )
    ).scalars().all()
    if len(existing_agents_with_numbers) >= limit:
        raise HTTPException(400, f"Your {plan} plan allows {limit} phone number(s). Upgrade for more.")
    purchased = await get_or_create_phone_number("US")
    if not purchased:
        raise HTTPException(503, "No phone numbers available right now. Try again in a few minutes.")
    number = purchased.get("number")
    if not number:
        raise HTTPException(503, "Telnyx did not return a usable phone number. Try again in a few minutes.")
    agent.telnyx_phone = number
    agent.telnyx_phone_sid = purchased.get("phone_number_id")
    await db.commit()
    await db.refresh(agent)
    return {
        "agent": _agent_dict(agent),
        "telnyx_number": agent.telnyx_phone,
        "instructions": get_forwarding_instructions(agent.telnyx_phone),
        "message": "Your OneClerk number is ready. Follow the instructions to activate call forwarding.",
    }


@router.delete("/{agent_id}/release-number")
async def release_number(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    if agent.telnyx_phone_sid and telnyx is not None and settings.TELNYX_API_KEY:
        telnyx.api_key = settings.TELNYX_API_KEY
        telnyx.PhoneNumber.delete(agent.telnyx_phone_sid)
    agent.telnyx_phone = None
    agent.telnyx_phone_sid = None
    agent.twilio_number = None
    await db.commit()
    return {"released": True}
