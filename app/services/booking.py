"""Lightweight booking service. Calendly link delivery via WhatsApp for now;
Google Calendar / direct booking can plug in later behind the same interface.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def get_calendly_link(agent_config: dict) -> Optional[str]:
    """Return the agent's Calendly URL if configured, else None."""
    if not agent_config:
        return None
    url = agent_config.get("calendly_url") or ""
    return url.strip() or None


async def check_availability(date: str, time: str, agent_id: str) -> bool:
    """Stub — wire to Google Calendar later."""
    return True


async def create_booking(details: dict, agent_id: str) -> dict:
    """Stub — wire to Google Calendar later."""
    return {"booked": True, "confirmation": "PENDING"}
