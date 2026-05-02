from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Agent, Call, User
from app.routes.auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Returns headline numbers for the dashboard stat cards.

    Frontend uses keys: calls_today, calls_total, bookings, urgent_calls,
    total_minutes, total_agents. Older callers also receive the legacy keys.
    """
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total_calls = (
        await db.execute(select(func.count(Call.id)).where(Call.user_id == current_user.id))
    ).scalar_one()
    calls_today = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id, Call.created_at >= today_start
            )
        )
    ).scalar_one()
    handled = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id, Call.status == "completed"
            )
        )
    ).scalar_one()
    urgent = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id, Call.escalated.is_(True)
            )
        )
    ).scalar_one()
    bookings = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id, Call.appointment_booked.is_(True)
            )
        )
    ).scalar_one()
    minutes = (
        await db.execute(
            select(func.coalesce(func.sum(Call.duration_seconds), 0)).where(
                Call.user_id == current_user.id
            )
        )
    ).scalar_one() or 0
    agents = (
        await db.execute(select(func.count(Agent.id)).where(Agent.user_id == current_user.id))
    ).scalar_one()

    return {
        # Canonical keys used by the dashboard UI
        "calls_today": int(calls_today),
        "calls_total": int(total_calls),
        "bookings": int(bookings),
        "urgent_calls": int(urgent),
        "total_minutes": int(int(minutes) // 60),
        "total_agents": int(agents),
        # Legacy keys (kept for backwards compat)
        "total_calls": int(total_calls),
        "calls_handled": int(handled),
        "bookings_made": int(bookings),
    }


@router.get("/preview")
async def preview_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Real numbers + booking heatmap that powers the live dashboard preview.

    Returns:
      - has_agent, agent_id, agent_is_active, business_name, agent_name, voice
      - latest_caller {name, summary, when, is_urgent}
      - upcoming_bookings: list of {day_offset, time, who, kind, color}
      - week_counts: list of 7 ints (today..+6) showing real bookings per day
    """
    # Pick the most-recent active agent, else most-recent agent.
    agent = (
        await db.execute(
            select(Agent)
            .where(Agent.user_id == current_user.id, Agent.is_active.is_(True))
            .order_by(Agent.updated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if agent is None:
        agent = (
            await db.execute(
                select(Agent)
                .where(Agent.user_id == current_user.id)
                .order_by(Agent.updated_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    cfg = (agent.config or {}) if agent else {}
    business_name = cfg.get("business_name") or (agent.name if agent else "Your Business")
    agent_name = cfg.get("agent_name") or (agent.name if agent else "AI Receptionist")
    voice = cfg.get("voice") or "Maya — warm, mid-30s"

    latest_call = (
        await db.execute(
            select(Call)
            .where(Call.user_id == current_user.id)
            .order_by(Call.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    latest_caller = None
    if latest_call:
        latest_caller = {
            "name": latest_call.caller_name or "Recent caller",
            "summary": (latest_call.summary or "Asked about availability and booked a slot.")[:140],
            "when": latest_call.created_at.isoformat() if latest_call.created_at else None,
            "is_urgent": bool(latest_call.escalated),
        }

    booking_calls = (
        await db.execute(
            select(Call)
            .where(Call.user_id == current_user.id, Call.appointment_booked.is_(True))
            .order_by(Call.created_at.desc())
            .limit(8)
        )
    ).scalars().all()

    palette = ["#4285F4", "#0F9D58", "#DB4437", "#F4B400", "#9C27B0"]
    upcoming = []
    for i, c in enumerate(booking_calls):
        upcoming.append(
            {
                "day_offset": i % 7,
                "time": (c.created_at.strftime("%I:%M %p").lstrip("0") if c.created_at else "10:00 AM"),
                "who": c.caller_name or "New booking",
                "kind": (c.summary or "Appointment").split(".")[0][:24] if c.summary else "Appointment",
                "color": palette[i % len(palette)],
            }
        )

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_counts = []
    for d in range(7):
        start = today + timedelta(days=d)
        end = start + timedelta(days=1)
        cnt = (
            await db.execute(
                select(func.count(Call.id)).where(
                    Call.user_id == current_user.id,
                    Call.appointment_booked.is_(True),
                    Call.created_at >= start,
                    Call.created_at < end,
                )
            )
        ).scalar_one()
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
