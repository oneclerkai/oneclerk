"""Billing calculator — rollover minutes engine and overage calculations.

Plan definitions (minutes included per month, overage rate in INR per minute):
  trial    →  50 mins,  no overage (calls blocked at limit)
  starter  → 300 mins,  ₹5 / min overage
  growth   → 600 mins,  ₹4 / min overage
  scale    → 1200 mins, ₹3 / min overage
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

import pytz

logger = logging.getLogger("oneclerk.billing")

# ---------------------------------------------------------------------------
# Plan configuration
# ---------------------------------------------------------------------------

PLAN_CONFIG: dict[str, dict] = {
    "trial": {
        "name": "Trial",
        "included_minutes": 50,
        "overage_rate_inr": 0,   # blocked, no overage
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
    pct_used: float          # 0–100
    alert_80: bool           # crossed 80 % threshold
    alert_100: bool          # crossed 100 % threshold (into overage)
    allow_overage: bool


def calculate_usage(
    plan: str,
    minutes_used: int,
    rollover_minutes: int,
    rollover_expires_at: Optional[datetime] = None,
) -> UsageSummary:
    """Return a full usage summary for a user.

    Rollover minutes are only counted if they have not expired.
    """
    cfg = PLAN_CONFIG.get(plan, PLAN_CONFIG["trial"])
    included = cfg["included_minutes"]
    overage_rate = cfg["overage_rate_inr"]
    allow_overage = cfg["allow_overage"]

    # Expire rollover if past expiry date
    now_utc = datetime.utcnow()
    valid_rollover = 0
    if rollover_minutes > 0:
        if rollover_expires_at is None or rollover_expires_at > now_utc:
            valid_rollover = rollover_minutes

    total_available = included + valid_rollover
    overage_minutes = max(0, minutes_used - total_available)
    minutes_remaining = max(0, total_available - minutes_used)
    overage_cost = overage_minutes * overage_rate if allow_overage else 0.0

    pct_used = min(100.0, (minutes_used / total_available * 100)) if total_available > 0 else 0.0
    alert_80 = pct_used >= 80.0
    alert_100 = minutes_used >= total_available

    return UsageSummary(
        plan=plan,
        included_minutes=included,
        rollover_minutes=valid_rollover,
        total_available=total_available,
        minutes_used=minutes_used,
        minutes_remaining=minutes_remaining,
        overage_minutes=overage_minutes,
        overage_cost_inr=overage_cost,
        pct_used=pct_used,
        alert_80=alert_80,
        alert_100=alert_100,
        allow_overage=allow_overage,
    )


def compute_rollover(
    plan: str,
    minutes_used: int,
    rollover_minutes: int,
    rollover_expires_at: Optional[datetime],
) -> tuple[int, datetime]:
    """Compute new rollover balance at month-end.

    Unused included minutes (up to 50 % of the plan's included minutes) roll
    over to the next month and expire after 30 days.

    Returns (new_rollover_minutes, new_rollover_expires_at).
    """
    cfg = PLAN_CONFIG.get(plan, PLAN_CONFIG["trial"])
    included = cfg["included_minutes"]

    # Expire old rollover
    now_utc = datetime.utcnow()
    surviving_rollover = 0
    if rollover_minutes > 0 and rollover_expires_at and rollover_expires_at > now_utc:
        surviving_rollover = rollover_minutes

    total_available = included + surviving_rollover
    unused = max(0, total_available - minutes_used)

    # Cap rollover at 50 % of included minutes
    max_rollover = included // 2
    new_rollover = min(unused, max_rollover)
    new_expires_at = now_utc + timedelta(days=30)

    logger.info(
        "Rollover computed plan=%s used=%d unused=%d new_rollover=%d",
        plan, minutes_used, unused, new_rollover,
    )
    return new_rollover, new_expires_at


def can_accept_call(
    plan: str,
    minutes_used: int,
    rollover_minutes: int,
    rollover_expires_at: Optional[datetime],
) -> bool:
    """Return True if the user is allowed to receive another call."""
    cfg = PLAN_CONFIG.get(plan, PLAN_CONFIG["trial"])
    if cfg["allow_overage"]:
        return True  # paid plans always accept (overage billed)
    # Trial / plans without overage: block when limit reached
    summary = calculate_usage(plan, minutes_used, rollover_minutes, rollover_expires_at)
    return summary.minutes_remaining > 0
