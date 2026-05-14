"""Dashboard stats and voice preview endpoints."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
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

    return {
        "total_agents": int(agents_count),
        "active_agents": int(active_agents),
        "total_calls": int(total_calls),
        "calls_today": int(calls_today),
        "calls_handled": int(handled),
        "urgent_calls": int(urgent),
        "urgent_today": int(urgent_today),
        "bookings_made": int(bookings),
        "bookings_today": int(bookings_today),
        "escalations_today": int(escalations_today),
        "total_minutes": int(int(minutes_raw) // 60),
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


# ---------------------------------------------------------------------------
# Additional dashboard endpoints
# ---------------------------------------------------------------------------

@router.get("/calls-today")
async def calls_today(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return today's call count and total duration."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    count = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id,
                Call.created_at >= today_start,
            )
        )
    ).scalar_one()

    duration_raw = (
        await db.execute(
            select(func.coalesce(func.sum(Call.duration_seconds), 0)).where(
                Call.user_id == current_user.id,
                Call.created_at >= today_start,
            )
        )
    ).scalar_one() or 0

    return {
        "calls_today": int(count),
        "duration_seconds_today": int(duration_raw),
        "duration_minutes_today": round(int(duration_raw) / 60, 1),
    }


@router.get("/usage")
async def usage_stats(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return minutes used, rollover, and overage for the current billing period."""
    plan_key = current_user.plan or "trial"
    usage = calculate_usage(
        plan=plan_key,
        minutes_used=current_user.minutes_used_this_month or 0,
        rollover_minutes=current_user.rollover_minutes or 0,
        rollover_expires_at=current_user.rollover_expires_at,
    )
    return {
        "plan": plan_key,
        "minutes_used": usage.minutes_used,
        "minutes_included": usage.included_minutes,
        "rollover_minutes": usage.rollover_minutes,
        "total_available": usage.total_available,
        "minutes_remaining": usage.minutes_remaining,
        "overage_minutes": usage.overage_minutes,
        "overage_cost_inr": usage.overage_cost_inr,
        "pct_used": round(usage.pct_used, 1),
        "alert_80": usage.alert_80,
        "alert_100": usage.alert_100,
        "allow_overage": usage.allow_overage,
    }


@router.get("/revenue")
async def revenue_stats(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return Stripe revenue and overage charges for the current user."""
    plan_key = current_user.plan or "trial"
    plan_prices = {"trial": 0, "starter": 39, "growth": 99, "scale": 149}
    monthly_revenue = plan_prices.get(plan_key, 0)

    usage = calculate_usage(
        plan=plan_key,
        minutes_used=current_user.minutes_used_this_month or 0,
        rollover_minutes=current_user.rollover_minutes or 0,
        rollover_expires_at=current_user.rollover_expires_at,
    )

    return {
        "plan": plan_key,
        "monthly_revenue_usd": monthly_revenue,
        "overage_cost_inr": usage.overage_cost_inr,
        "stripe_customer_id": current_user.stripe_customer_id,
        "subscription_status": current_user.subscription_status or ("trialing" if plan_key == "trial" else "active"),
        "stripe_configured": bool(settings.STRIPE_SECRET_KEY),
    }


@router.get("/alerts")
async def usage_alerts(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return usage threshold warnings (80% and 100% alerts)."""
    plan_key = current_user.plan or "trial"
    usage = calculate_usage(
        plan=plan_key,
        minutes_used=current_user.minutes_used_this_month or 0,
        rollover_minutes=current_user.rollover_minutes or 0,
        rollover_expires_at=current_user.rollover_expires_at,
    )

    alerts = []
    if usage.alert_100:
        alerts.append({
            "level": "critical",
            "type": "usage_100",
            "message": f"You've used all {usage.included_minutes} included minutes this month. Overage charges apply.",
        })
    elif usage.alert_80:
        alerts.append({
            "level": "warning",
            "type": "usage_80",
            "message": f"You've used {round(usage.pct_used)}% of your {usage.included_minutes} included minutes.",
        })

    if current_user.trial_ends_at:
        days_left = (current_user.trial_ends_at - datetime.utcnow()).days
        if plan_key == "trial" and days_left <= 3:
            alerts.append({
                "level": "warning",
                "type": "trial_expiring",
                "message": f"Your free trial expires in {max(0, days_left)} day(s). Upgrade to keep your agent live.",
            })

    return {"alerts": alerts, "has_alerts": len(alerts) > 0}
