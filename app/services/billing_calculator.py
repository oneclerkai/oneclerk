"""Billing calculator — rollover minutes engine and overage calculations.

Plan definitions (minutes included per month, overage rate in INR per minute):
  trial    →  50 mins,  no overage (calls blocked at limit)
  starter  → 300 mins,  ₹5 / min overage
  growth   → 600 mins,  ₹4 / min overage
  scale    → 1200 mins, ₹3 / min overage
"""
from __future__ import annotations

import calendar
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger("oneclerk.billing")

# ---------------------------------------------------------------------------
# Plan configuration
# ---------------------------------------------------------------------------

PLAN_CONFIG: dict[str, dict] = {
    "trial": {
        "name": "Trial",
        "included_minutes": 50,
        "overage_rate_inr": 0,
        "allow_overage": False,
    },
    "starter": {
        "name": "Starter",
        "included_minutes": 300,
        "overage_rate_inr": 5,
        "allow_overage": True,
    },
    "growth": {
        "name": "Growth",
        "included_minutes": 600,
        "overage_rate_inr": 4,
        "allow_overage": True,
    },
    "scale": {
        "name": "Scale",
        "included_minutes": 1200,
        "overage_rate_inr": 3,
        "allow_overage": True,
    },
}


@dataclass
class UsageSummary:
    plan: str
    included_minutes: int
    rollover_minutes: int
    total_available: int
    minutes_used: int
    minutes_remaining: int
    overage_minutes: int
    overage_cost_inr: float
    pct_used: float
    alert_80: bool
    alert_100: bool
    allow_overage: bool
    rollover_expired: bool


def _normalize_plan(plan: str | None) -> str:
    return (plan or "trial").lower()


def _prorated_included_minutes(included: int, created_at: Optional[datetime], as_of: datetime) -> int:
    if created_at is None:
        return included
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    current_month_start = as_of.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if created_at >= current_month_start:
        days_in_month = calendar.monthrange(as_of.year, as_of.month)[1]
        remaining_days = max(1, (current_month_start + timedelta(days=days_in_month) - created_at).days)
        return max(1, int(included * remaining_days / days_in_month))
    return included


def _is_rollover_expired(rollover_expires_at: Optional[datetime], now: datetime) -> bool:
    if rollover_expires_at is None:
        return False
    if rollover_expires_at.tzinfo is None:
        rollover_expires_at = rollover_expires_at.replace(tzinfo=timezone.utc)
    return rollover_expires_at <= now


def calculate_usage(
    plan: str,
    minutes_used: int,
    rollover_minutes: int,
    rollover_expires_at: Optional[datetime] = None,
    created_at: Optional[datetime] = None,
    now: Optional[datetime] = None,
) -> UsageSummary:
    now = now or datetime.now(timezone.utc)
    normalized = _normalize_plan(plan)
    cfg = PLAN_CONFIG.get(normalized, PLAN_CONFIG["trial"])

    included = _prorated_included_minutes(cfg["included_minutes"], created_at, now)
    rollover_expired = _is_rollover_expired(rollover_expires_at, now)
    valid_rollover = 0 if rollover_expired else min(rollover_minutes, cfg["included_minutes"] // 2)

    total_available = included + valid_rollover
    overage_minutes = max(0, minutes_used - total_available)
    minutes_remaining = max(0, total_available - minutes_used)
    overage_cost = float(overage_minutes * cfg["overage_rate_inr"]) if cfg["allow_overage"] else 0.0

    pct_used = 100.0 if total_available == 0 else min(100.0, (minutes_used / total_available) * 100.0)
    alert_80 = minutes_used >= total_available * 0.8 and minutes_used < total_available
    alert_100 = minutes_used >= total_available

    if alert_100 and not cfg["allow_overage"]:
        minutes_remaining = 0

    return UsageSummary(
        plan=normalized,
        included_minutes=included,
        rollover_minutes=valid_rollover,
        total_available=total_available,
        minutes_used=minutes_used,
        minutes_remaining=minutes_remaining,
        overage_minutes=overage_minutes if cfg["allow_overage"] else 0,
        overage_cost_inr=overage_cost,
        pct_used=pct_used,
        alert_80=alert_80,
        alert_100=alert_100,
        allow_overage=cfg["allow_overage"],
        rollover_expired=rollover_expired,
    )


def compute_rollover(
    plan: str,
    minutes_used: int,
    rollover_minutes: int,
    rollover_expires_at: Optional[datetime],
    created_at: Optional[datetime] = None,
    now: Optional[datetime] = None,
) -> tuple[int, datetime]:
    now = now or datetime.now(timezone.utc)
    normalized = _normalize_plan(plan)
    cfg = PLAN_CONFIG.get(normalized, PLAN_CONFIG["trial"])

    included = _prorated_included_minutes(cfg["included_minutes"], created_at, now)
    rollover_expired = _is_rollover_expired(rollover_expires_at, now)
    surviving_rollover = 0 if rollover_expired else min(rollover_minutes, cfg["included_minutes"] // 2)

    total_available = included + surviving_rollover
    unused = max(0, total_available - minutes_used)
    max_rollover = cfg["included_minutes"] // 2
    new_rollover = min(unused, max_rollover)
    new_expires_at = now + timedelta(days=30)

    logger.info(
        "Rollover computed plan=%s used=%d unused=%d new_rollover=%d",
        normalized,
        minutes_used,
        unused,
        new_rollover,
    )
    return new_rollover, new_expires_at


def can_accept_call(
    plan: str,
    minutes_used: int,
    rollover_minutes: int,
    rollover_expires_at: Optional[datetime],
) -> bool:
    cfg = PLAN_CONFIG.get(plan, PLAN_CONFIG["trial"])
    if cfg["allow_overage"]:
        return True
    summary = calculate_usage(plan, minutes_used, rollover_minutes, rollover_expires_at)
    return summary.minutes_remaining > 0
