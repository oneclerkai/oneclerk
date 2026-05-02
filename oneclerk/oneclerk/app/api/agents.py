from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, desc
from app.database import get_db
from app.models.agent import Agent, AgentStatus
from app.models.call import Call
from app.dependencies import get_current_user
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
import uuid

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentBody(BaseModel):
    name: Optional[str] = None
    twilio_number: Optional[str] = None
    forwarding_number: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    system_prompt: Optional[str] = None
    voice_id: Optional[str] = None
    language: Optional[str] = None
    escalation_phone: Optional[str] = None
    escalation_keywords: Optional[List[str]] = None
    max_call_duration: Optional[int] = None

    class Config:
        extra = "allow"


class TestChatBody(BaseModel):
    message: str
    history: Optional[List[Dict[str, Any]]] = []


def _agent_out(a: Agent) -> dict:
    config = a.business_context or {}
    return {
        "id": str(a.id),
        "user_id": str(a.user_id),
        "name": a.name,
        "is_active": a.status == AgentStatus.active,
        "status": a.status.value if a.status else "inactive",
        "config": config,
        "voice_id": a.voice_id,
        "language": a.language.value if a.language else "auto",
        "telnyx_phone": a.telnyx_phone,
        "twilio_number": config.get("twilio_number", ""),
        "forwarding_number": config.get("forwarding_number", ""),
        "escalation_phone": a.escalation_phone,
        "escalation_keywords": a.escalation_keywords or [],
        "max_call_duration": a.max_call_duration,
        "calls_this_month": a.calls_this_month,
        "total_calls": a.total_calls,
        "total_minutes": a.total_minutes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


def _merge_config(agent: Agent, body: AgentBody):
    if body.name is not None:
        agent.name = body.name
    if body.voice_id is not None:
        agent.voice_id = body.voice_id
    if body.system_prompt is not None:
        agent.system_prompt = body.system_prompt
    if body.escalation_phone is not None:
        agent.escalation_phone = body.escalation_phone
    if body.escalation_keywords is not None:
        agent.escalation_keywords = body.escalation_keywords
    if body.max_call_duration is not None:
        agent.max_call_duration = body.max_call_duration

    ctx = dict(agent.business_context or {})
    if body.config is not None:
        ctx.update(body.config)
    if body.twilio_number is not None:
        ctx["twilio_number"] = body.twilio_number
    if body.forwarding_number is not None:
        ctx["forwarding_number"] = body.forwarding_number
    agent.business_context = ctx


@router.get("/list")
async def list_agents_alias(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _list_agents(current_user, db)


@router.get("/")
async def list_agents(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _list_agents(current_user, db)


async def _list_agents(current_user: dict, db: AsyncSession):
    stmt = select(Agent).where(Agent.user_id == current_user["sub"])
    result = await db.execute(stmt)
    agents = result.scalars().all()
    return {"agents": [_agent_out(a) for a in agents]}


@router.get("/{agent_id}/summary")
async def agent_summary(
    agent_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Per-agent header stats for the Agents page header card."""
    user_id = current_user["sub"]
    agent = (await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.user_id == user_id)
    )).scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    calls_total = (await db.execute(
        select(func.count(Call.id)).where(Call.agent_id == agent.id)
    )).scalar() or 0
    calls_today = (await db.execute(
        select(func.count(Call.id)).where(Call.agent_id == agent.id, Call.created_at >= today_start)
    )).scalar() or 0
    bookings = (await db.execute(
        select(func.count(Call.id)).where(Call.agent_id == agent.id, Call.appointment_booked == True)
    )).scalar() or 0
    urgent = (await db.execute(
        select(func.count(Call.id)).where(Call.agent_id == agent.id, Call.escalated == True)
    )).scalar() or 0
    minutes = (await db.execute(
        select(func.coalesce(func.sum(Call.duration_seconds), 0)).where(Call.agent_id == agent.id)
    )).scalar() or 0
    last_call = (await db.execute(
        select(Call).where(Call.agent_id == agent.id).order_by(desc(Call.created_at)).limit(1)
    )).scalar_one_or_none()

    ctx = agent.business_context or {}
    layout = ctx.get("builder_layout") or {}
    nodes = len(layout.get("boxes") or []) if isinstance(layout, dict) else 0
    edges = len(layout.get("edges") or []) if isinstance(layout, dict) else 0

    return {
        "agent_id": str(agent.id),
        "is_active": agent.status == AgentStatus.active,
        "calls_total": int(calls_total),
        "calls_today": int(calls_today),
        "bookings": int(bookings),
        "urgent": int(urgent),
        "minutes_total": int(int(minutes) // 60),
        "last_call_at": last_call.created_at.isoformat() if last_call and last_call.created_at else None,
        "last_caller": (last_call.caller_name if last_call else None),
        "nodes": nodes,
        "edges": edges,
        "twilio_number": ctx.get("twilio_number", ""),
        "forwarding_number": ctx.get("forwarding_number", ""),
    }


@router.post("/create")
async def create_agent_alias(
    body: AgentBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _create_agent(body, current_user, db)


@router.post("/")
async def create_agent(
    body: AgentBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _create_agent(body, current_user, db)


async def _create_agent(body: AgentBody, current_user: dict, db: AsyncSession):
    agent = Agent(
        user_id=current_user["sub"],
        name=body.name or "New Agent",
        business_context={},
    )
    _merge_config(agent, body)
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return {"agent": _agent_out(agent)}


@router.get("/{agent_id}")
async def get_agent(
    agent_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"])
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"agent": _agent_out(agent)}


@router.put("/{agent_id}")
@router.patch("/{agent_id}")
async def update_agent(
    agent_id: uuid.UUID,
    body: AgentBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"])
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    _merge_config(agent, body)
    await db.commit()
    await db.refresh(agent)
    return {"agent": _agent_out(agent)}


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = delete(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"])
    await db.execute(stmt)
    await db.commit()
    return {"status": "deleted"}


@router.post("/{agent_id}/activate")
async def activate_agent(
    agent_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = update(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"]).values(status=AgentStatus.active)
    await db.execute(stmt)
    await db.commit()
    return {"status": "activated"}


@router.post("/{agent_id}/deactivate")
async def deactivate_agent(
    agent_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = update(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"]).values(status=AgentStatus.inactive)
    await db.execute(stmt)
    await db.commit()
    return {"status": "deactivated"}


@router.get("/{agent_id}/setup-instructions")
async def get_setup_instructions(
    agent_id: uuid.UUID,
    carrier: Optional[str] = "telnyx",
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"])
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    phone = agent.telnyx_phone or "+1 (TBD after activation)"
    return {
        "carrier": carrier,
        "forwarding_number": phone,
        "steps": [
            f"Buy a number in {carrier.capitalize()} console",
            f"Set the voice webhook to: https://<your-domain>/telnyx/voice",
            f"Add the phone number to this agent in settings",
            f"Tell customers to call {phone} or set call-forwarding from your existing number",
        ],
    }


@router.post("/{agent_id}/test-chat")
async def test_chat(
    agent_id: uuid.UUID,
    body: TestChatBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.config import settings

    stmt = select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user["sub"])
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    ctx = agent.business_context or {}
    biz_name = ctx.get("business_name") or agent.name
    greeting = ctx.get("greeting_message") or f"Hello! Thanks for calling {biz_name}. How can I help you?"

    if not settings.OPENAI_API_KEY:
        return {
            "reply": f"Hi! I'm {ctx.get('agent_name') or 'your AI receptionist'} at {biz_name}. {greeting}",
            "source": "fallback",
        }

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        system = (agent.system_prompt or
                  f"You are {ctx.get('agent_name') or 'a helpful AI receptionist'} at {biz_name}. "
                  f"{greeting} Be concise and friendly.")
        messages = [{"role": "system", "content": system}]
        for turn in (body.history or []):
            messages.append({"role": turn.get("role", "user"), "content": turn.get("content", "")})
        messages.append({"role": "user", "content": body.message})
        resp = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=200,
        )
        return {"reply": resp.choices[0].message.content, "source": "openai"}
    except Exception as e:
        return {"reply": f"I'm your AI receptionist for {biz_name}. How can I help?", "source": "fallback"}


@router.post("/{agent_id}/get-number")
async def get_agent_number(agent_id: uuid.UUID, current_user: dict = Depends(get_current_user)):
    return {"phone_number": "+1234567890"}
