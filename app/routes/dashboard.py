"""Dashboard stats and voice preview endpoints."""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Agent, Call, User
from app.routes.auth import get_current_user
from app.services.billing_calculator import calculate_usage

logger = logging.getLogger("oneclerk.dashboard")
router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total_calls = (
        await db.execute(select(func.count(Call.id)).where(Call.user_id == current_user.id))
    ).scalar_one()

    calls_today = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id,
                Call.created_at >= today_start,
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
                Call.user_id == current_user.id, Call.is_urgent.is_(True)
            )
        )
    ).scalar_one()

    urgent_today = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id,
                Call.is_urgent.is_(True),
                Call.created_at >= today_start,
            )
        )
    ).scalar_one()

    bookings = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id, Call.booking_made.is_(True)
            )
        )
    ).scalar_one()

    bookings_today = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id,
                Call.booking_made.is_(True),
                Call.created_at >= today_start,
            )
        )
    ).scalar_one()

    escalations_today = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id,
                Call.escalated.is_(True),
                Call.created_at >= today_start,
            )
        )
    ).scalar_one()

    minutes_raw = (
        await db.execute(
            select(func.coalesce(func.sum(Call.duration_seconds), 0)).where(
                Call.user_id == current_user.id
            )
        )
    ).scalar_one() or 0

    agents_count = (
        await db.execute(select(func.count(Agent.id)).where(Agent.user_id == current_user.id))
    ).scalar_one()

    active_agents = (
        await db.execute(
            select(func.count(Agent.id)).where(
                Agent.user_id == current_user.id, Agent.is_active.is_(True)
            )
        )
    ).scalar_one()

    summary = {
        "total_agents": int(agents_count),
        "active_agents": int(active_agents),
        "total_calls": int(total_calls),
        "calls_today": int(calls_today),
        "calls_handled": int(handled),
        "urgent_calls": int(urgent),
        "urgent_today": int(urgent_today),
        "bookings": int(bookings),        # used by dashboard stat card
        "bookings_made": int(bookings),   # legacy alias
        "bookings_today": int(bookings_today),
        "escalations_today": int(escalations_today),
        "total_minutes": int(int(minutes_raw) // 60),
    }
    return summary


@router.get("/overview")
async def overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await stats(current_user=current_user, db=db)


@router.get("/calls")
async def dashboard_calls(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Call)
        .where(Call.user_id == current_user.id)
        .order_by(desc(Call.created_at))
        .limit(50)
    )
    calls = [
        {
            "id": call.id,
            "call_sid": call.call_sid,
            "agent_id": call.agent_id,
            "caller_number": call.caller_number,
            "duration_seconds": call.duration_seconds,
            "status": call.status,
            "is_urgent": call.is_urgent,
            "booking_made": call.booking_made,
            "summary": call.summary,
            "conversation": call.conversation or [],
            "created_at": call.created_at.isoformat() if call.created_at else None,
            "ended_at": call.ended_at.isoformat() if call.ended_at else None,
        }
        for call in result.scalars().all()
    ]
    return {"calls": calls}


@router.get("/usage")
async def dashboard_usage(
    current_user: User = Depends(get_current_user),
) -> dict:
    usage = calculate_usage(
        plan=current_user.plan or "trial",
        minutes_used=current_user.minutes_used_this_month or 0,
        rollover_minutes=current_user.rollover_minutes or 0,
        rollover_expires_at=current_user.rollover_expires_at,
        created_at=current_user.created_at,
    )
    return {
        "plan": usage.plan,
        "included_minutes": usage.included_minutes,
        "rollover_minutes": usage.rollover_minutes,
        "total_available": usage.total_available,
        "minutes_used": usage.minutes_used,
        "minutes_remaining": usage.minutes_remaining,
        "overage_minutes": usage.overage_minutes,
        "overage_cost_inr": usage.overage_cost_inr,
        "pct_used": usage.pct_used,
        "alert_80": usage.alert_80,
        "alert_100": usage.alert_100,
        "allow_overage": usage.allow_overage,
        "rollover_expired": usage.rollover_expired,
    }


# ---------------------------------------------------------------------------
# Voice preview endpoint — synthesizes a short greeting and returns audio URL
# ---------------------------------------------------------------------------

class VoicePreviewRequest(BaseModel):
    text: str
    language: str = "english"
    voice_id: str | None = None


@router.post("/voice-preview")
async def voice_preview(
    body: VoicePreviewRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Synthesize a short text sample and return a public audio URL.

    Used by the dashboard voice preview widget and the agent setup page.
    Capped at 200 characters to prevent abuse.
    """
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs is not configured. Set ELEVENLABS_API_KEY.",
        )

    text = body.text.strip()[:200]
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    try:
        from app.services.synthesis import synthesize
        audio_url = await synthesize(
            text=text,
            language=body.language,
            gender="female",
            voice_id=body.voice_id or None,
        )
        if not audio_url:
            raise HTTPException(status_code=502, detail="Synthesis returned empty audio")
        return {"audio_url": audio_url, "text": text}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Voice preview synthesis failed")
        raise HTTPException(status_code=502, detail=f"Synthesis error: {exc}") from exc
