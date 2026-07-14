from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models import Agent
from app.services.crypto_utils import encrypt_value
from app.routes.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/agents", tags=["agents"])


class GoogleCalendarConnectRequest(BaseModel):
    credentials: dict[str, Any]
    calendar_id: str | None = "primary"
    timezone: str | None = None


async def _get_owned_agent(db: AsyncSession, user: User, agent_id: str) -> Agent:
    result = await db.execute(
        __import__("sqlalchemy").select(Agent).where(Agent.id == agent_id, Agent.user_id == user.id)
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.post("/{agent_id}/google-calendar/connect")
async def connect_google_calendar(
    agent_id: str,
    data: GoogleCalendarConnectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Store per-agent Google Calendar refresh token encrypted at rest.

    Expected payload: { credentials: { refresh_token: '...', token: '...', ... }, calendar_id }
    """
    agent = await _get_owned_agent(db, current_user, agent_id)
    creds = data.credentials or {}
    # Credentials may include either 'refresh_token' (recommended) or 'token' (access_token). We need refresh token.
    refresh = creds.get("refresh_token") or creds.get("refreshToken") or creds.get("token")
    if not refresh:
        raise HTTPException(status_code=400, detail="Google credentials must include a refresh_token")

    # Encrypt and persist refresh token on the agent row
    try:
        agent.google_refresh_token_encrypted = encrypt_value(str(refresh))
    except Exception as exc:  # pragma: no cover - encryption errors
        raise HTTPException(status_code=500, detail="Failed to encrypt Google credentials") from exc

    agent.google_calendar_id = (data.calendar_id or "primary")
    if data.timezone:
        agent.timezone = data.timezone

    # Keep a lightweight config flag for compatibility
    cfg = agent.config or {}
    cfg["google_calendar_connected"] = True
    agent.config = cfg
    flag_modified(agent, "config")

    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return {"agent": {
        "id": agent.id,
        "google_calendar_connected": True,
        "google_calendar_id": agent.google_calendar_id,
        "timezone": agent.timezone,
    }}
