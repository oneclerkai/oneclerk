from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Agent, Call, User
from app.routes.auth import get_current_user
from app.services.ai_brain import get_ai_response
from app.services.forwarding import get_forwarding_instructions

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentConfig(BaseModel):
    business_name: str
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
    # Visual flow builder data: { nodes: [...], edges: [...] }
    flow: dict[str, Any] | None = None


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
        "phone": bool(agent.twilio_number),
        "whatsapp": bool(cfg.get("owner_whatsapp")),
        "ai_brain": bool(settings.OPENAI_API_KEY),
        "voice": bool(settings.ELEVENLABS_API_KEY),
        "twilio": bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN),
        "booking": bool(cfg.get("calendly_url")),
        "flow_configured": bool((cfg.get("flow") or {}).get("nodes")),
    }


def _agent_dict(agent: Agent) -> dict:
    return {
        "id": agent.id,
        "user_id": agent.user_id,
        "name": agent.name,
        "twilio_number": agent.twilio_number,
        "forwarding_number": agent.forwarding_number,
        "is_active": agent.is_active,
        "config": agent.config or {},
        "voice_id": agent.voice_id,
        "language": agent.language,
        "calls_this_month": agent.calls_this_month,
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
        "connection_status": _connection_status(agent),
    }


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
        config=data.config.model_dump(),
        voice_id=data.voice_id or "Polly.Aditi",
        language=data.language or "en-IN",
        is_active=False,
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
    agent.config = data.config.model_dump()
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
    agent.is_active = True
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
    await db.commit()
    return {"status": "paused"}


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    agent = await _get_owned_agent(db, current_user, agent_id)
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
    if not agent.twilio_number:
        raise HTTPException(400, "Set a Twilio number on this agent first.")
    return get_forwarding_instructions(agent.twilio_number, carrier=carrier)


@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_owned_agent(db, current_user, agent_id)
    return {"agent": _agent_dict(agent)}


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
        conversation_history=data.history,
        agent_config=agent.config or {},
        caller_message=data.message,
        channel="voice",
    )
    return {"reply": reply}


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
