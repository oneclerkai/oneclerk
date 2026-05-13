"""Dashboard stats and voice preview endpoints."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Agent, Call, User
from app.routes.auth import get_current_user
from app.services.billing_calculator import PLAN_CONFIG, calculate_usage

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
# Usage endpoint — minutes used, rollover, overage
# ---------------------------------------------------------------------------

@router.get("/usage")
async def usage(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return the current user's minutes usage, rollover balance, and overage
    details.  Mirrors the data shape consumed by the UsageWidget component.
    """
    plan_key = current_user.plan or "trial"
    summary = calculate_usage(
        plan=plan_key,
        minutes_used=current_user.minutes_used_this_month or 0,
        rollover_minutes=current_user.rollover_minutes or 0,
        rollover_expires_at=current_user.rollover_expires_at,
    )
    return {
        "plan": plan_key,
        "minutes_used": summary.minutes_used,
        "minutes_included": summary.included_minutes,
        "rollover_minutes": summary.rollover_minutes,
        "total_available": summary.total_available,
        "minutes_remaining": summary.minutes_remaining,
        "overage_minutes": summary.overage_minutes,
        "overage_cost_inr": round(summary.overage_cost_inr, 2),
        "pct_used": round(summary.pct_used, 1),
        "alert_80": summary.alert_80,
        "alert_100": summary.alert_100,
        "allow_overage": summary.allow_overage,
    }


# ---------------------------------------------------------------------------
# Calls-today endpoint
# ---------------------------------------------------------------------------

@router.get("/calls-today")
async def calls_today(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return today's call count and total duration in seconds and minutes."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    count = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id,
                Call.created_at >= today_start,
            )
        )
    ).scalar_one()

    duration_seconds_raw = (
        await db.execute(
            select(func.coalesce(func.sum(Call.duration_seconds), 0)).where(
                Call.user_id == current_user.id,
                Call.created_at >= today_start,
            )
        )
    ).scalar_one() or 0

    return {
        "calls_today": int(count),
        "duration_seconds": int(duration_seconds_raw),
        "duration_minutes": round(int(duration_seconds_raw) / 60, 1),
        "date": today_start.date().isoformat(),
    }


# ---------------------------------------------------------------------------
# Revenue endpoint — Stripe overage charges summary
# ---------------------------------------------------------------------------

@router.get("/revenue")
async def revenue(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return a summary of Stripe subscription revenue and any overage charges
    accrued this billing cycle.
    """
    plan_key = current_user.plan or "trial"
    plan_cfg = PLAN_CONFIG.get(plan_key, PLAN_CONFIG["trial"])
    summary = calculate_usage(
        plan=plan_key,
        minutes_used=current_user.minutes_used_this_month or 0,
        rollover_minutes=current_user.rollover_minutes or 0,
        rollover_expires_at=current_user.rollover_expires_at,
    )

    # Monthly subscription price (USD) — kept in sync with billing.py PLANS
    plan_prices_usd = {"trial": 0, "starter": 39, "growth": 99, "scale": 149}
    subscription_usd = plan_prices_usd.get(plan_key, 0)

    return {
        "plan": plan_key,
        "subscription_usd": subscription_usd,
        "overage_minutes": summary.overage_minutes,
        "overage_cost_inr": round(summary.overage_cost_inr, 2),
        "overage_rate_inr_per_min": plan_cfg.get("overage_rate_inr", 0),
        "stripe_customer_id": current_user.stripe_customer_id,
        "stripe_subscription_id": current_user.stripe_subscription_id,
        "subscription_status": current_user.subscription_status or (
            "trialing" if plan_key == "trial" else "active"
        ),
    }


# ---------------------------------------------------------------------------
# Alerts endpoint — usage threshold warnings
# ---------------------------------------------------------------------------

@router.get("/alerts")
async def alerts(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return active usage alerts so the frontend can surface warnings without
    polling the full billing status endpoint.
    """
    plan_key = current_user.plan or "trial"
    summary = calculate_usage(
        plan=plan_key,
        minutes_used=current_user.minutes_used_this_month or 0,
        rollover_minutes=current_user.rollover_minutes or 0,
        rollover_expires_at=current_user.rollover_expires_at,
    )

    active_alerts: list[dict] = []

    if summary.alert_100:
        if summary.allow_overage:
            active_alerts.append({
                "type": "overage",
                "severity": "warning",
                "message": (
                    f"You've used all {summary.total_available} included minutes. "
                    f"Overage is being billed at ₹{PLAN_CONFIG[plan_key]['overage_rate_inr']}/min."
                ),
                "minutes_over": summary.overage_minutes,
                "cost_inr": round(summary.overage_cost_inr, 2),
            })
        else:
            active_alerts.append({
                "type": "limit_reached",
                "severity": "error",
                "message": (
                    "You've reached your trial minute limit. "
                    "Upgrade to a paid plan to continue receiving calls."
                ),
                "minutes_over": 0,
                "cost_inr": 0,
            })
    elif summary.alert_80:
        active_alerts.append({
            "type": "approaching_limit",
            "severity": "info",
            "message": (
                f"You've used {summary.pct_used:.0f}% of your monthly minutes "
                f"({summary.minutes_used}/{summary.total_available} min)."
            ),
            "minutes_over": 0,
            "cost_inr": 0,
        })

    return {
        "alerts": active_alerts,
        "alert_count": len(active_alerts),
        "pct_used": round(summary.pct_used, 1),
        "minutes_remaining": summary.minutes_remaining,
    }
