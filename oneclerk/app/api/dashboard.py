from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_db
from app.models.call import Call
from app.models.agent import Agent
from app.dependencies import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def _get_stats_data(current_user: dict, db: AsyncSession) -> dict:
    user_id = current_user["sub"]
    today = datetime.utcnow().date()

    calls_today = (await db.execute(
        select(func.count(Call.id)).where(Call.user_id == user_id, Call.created_at >= today)
    )).scalar() or 0

    calls_total = (await db.execute(
        select(func.count(Call.id)).where(Call.user_id == user_id)
    )).scalar() or 0

    bookings = (await db.execute(
        select(func.count(Call.id)).where(Call.user_id == user_id, Call.appointment_booked == True)
    )).scalar() or 0

    urgent_calls = (await db.execute(
        select(func.count(Call.id)).where(Call.user_id == user_id, Call.escalated == True)
    )).scalar() or 0

    minutes_total = (await db.execute(
        select(func.coalesce(func.sum(Call.duration_seconds), 0)).where(Call.user_id == user_id)
    )).scalar() or 0

    total_agents = (await db.execute(
        select(func.count(Agent.id)).where(Agent.user_id == user_id)
    )).scalar() or 0

    return {
        "calls_today": int(calls_today),
        "calls_total": int(calls_total),
        "bookings": int(bookings),
        "urgent_calls": int(urgent_calls),
        "answer_rate": 1.0,
        "total_minutes": int(int(minutes_total) // 60),
        "total_agents": int(total_agents),
    }


@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get_stats_data(current_user, db)


@router.get("/overview")
async def get_overview(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get_stats_data(current_user, db)


@router.get("/preview")
async def get_preview(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Real numbers + booking heatmap that powers the live dashboard preview.

    Returns business name, agent name, voice, latest caller, upcoming bookings
    (mapped onto next 7 days), and per-day booking counts.
    """
    user_id = current_user["sub"]

    # Pick the most-recent active agent, else the most-recent agent overall.
    agent = (await db.execute(
        select(Agent).where(Agent.user_id == user_id, Agent.is_active == True)
        .order_by(desc(Agent.updated_at)).limit(1)
    )).scalar_one_or_none()
    if agent is None:
        agent = (await db.execute(
            select(Agent).where(Agent.user_id == user_id)
            .order_by(desc(Agent.updated_at)).limit(1)
        )).scalar_one_or_none()

    cfg = (agent.config or {}) if agent else {}
    business_name = cfg.get("business_name") or (agent.name if agent else "Your Business")
    agent_name = cfg.get("agent_name") or (agent.name if agent else "AI Receptionist")
    voice = cfg.get("voice") or "Maya — warm, mid-30s"

    latest_call = (await db.execute(
        select(Call).where(Call.user_id == user_id)
        .order_by(desc(Call.created_at)).limit(1)
    )).scalar_one_or_none()
    latest_caller = None
    if latest_call:
        latest_caller = {
            "name": latest_call.caller_name or "Recent caller",
            "summary": (latest_call.summary or "Asked about availability and booked a slot.")[:140],
            "when": latest_call.created_at.isoformat() if latest_call.created_at else None,
            "is_urgent": bool(latest_call.escalated),
        }

    booking_calls = (await db.execute(
        select(Call).where(Call.user_id == user_id, Call.appointment_booked == True)
        .order_by(desc(Call.created_at)).limit(8)
    )).scalars().all()

    palette = ["#4285F4", "#0F9D58", "#DB4437", "#F4B400", "#9C27B0"]
    upcoming = []
    for i, c in enumerate(booking_calls):
        upcoming.append({
            "day_offset": i % 7,
            "time": (c.created_at.strftime("%I:%M %p").lstrip("0") if c.created_at else "10:00 AM"),
            "who": c.caller_name or "New booking",
            "kind": (c.summary or "Appointment").split(".")[0][:24] if c.summary else "Appointment",
            "color": palette[i % len(palette)],
        })

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_counts = []
    for d in range(7):
        start = today + timedelta(days=d)
        end = start + timedelta(days=1)
        cnt = (await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == user_id,
                Call.appointment_booked == True,
                Call.created_at >= start,
                Call.created_at < end,
            )
        )).scalar() or 0
        week_counts.append(int(cnt))

    return {
        "has_agent": agent is not None,
        "agent_id": str(agent.id) if agent else None,
        "agent_is_active": bool(agent.is_active) if agent else False,
        "business_name": business_name,
        "agent_name": agent_name,
        "voice": voice,
        "latest_caller": latest_caller,
        "upcoming_bookings": upcoming,
        "week_counts": week_counts,
    }
