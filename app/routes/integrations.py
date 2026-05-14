"""Integration endpoints — Google Calendar and WhatsApp."""
from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.routes.auth import get_current_user
from app.services.redis_client import safe_delete, safe_get, safe_setex

logger = logging.getLogger("oneclerk.integrations")
router = APIRouter(prefix="/integrations", tags=["integrations"])

# ---------------------------------------------------------------------------
# Google Calendar
# ---------------------------------------------------------------------------

GOOGLE_CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
]

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


def _gcal_state_key(user_id: str) -> str:
    return f"gcal_oauth_state:{user_id}"


def _gcal_token_key(user_id: str) -> str:
    return f"gcal_token:{user_id}"


@router.post("/google-calendar/connect")
async def google_calendar_connect(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Initiate Google Calendar OAuth flow.

    Returns an authorization URL that the frontend should redirect the user to.
    """
    if not (settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET):
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )

    state = secrets.token_urlsafe(32)
    await safe_setex(_gcal_state_key(current_user.id), 600, state)

    redirect_uri = f"{settings.BACKEND_URL.rstrip('/')}/api/integrations/google-calendar/callback"
    scope = " ".join(GOOGLE_CALENDAR_SCOPES)

    auth_url = (
        f"{GOOGLE_AUTH_URL}"
        f"?client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope={scope}"
        f"&state={state}"
        f"&access_type=offline"
        f"&prompt=consent"
    )

    return {"auth_url": auth_url, "state": state}


@router.get("/google-calendar/callback")
async def google_calendar_callback(
    code: str,
    state: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Handle Google Calendar OAuth callback and store tokens."""
    import httpx

    stored_state_raw = await safe_get(_gcal_state_key(current_user.id))
    stored_state = (
        stored_state_raw.decode("utf-8")
        if isinstance(stored_state_raw, bytes)
        else stored_state_raw
    )
    if not stored_state or stored_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state. Please try connecting again.")

    redirect_uri = f"{settings.BACKEND_URL.rstrip('/')}/api/integrations/google-calendar/callback"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Google token exchange failed: {resp.text}")

    token_data = resp.json()
    if "error" in token_data:
        raise HTTPException(status_code=502, detail=f"Google OAuth error: {token_data['error']}")

    # Store tokens in Redis (TTL = access_token expiry, typically 3600s)
    import json
    ttl = token_data.get("expires_in", 3600)
    await safe_setex(_gcal_token_key(current_user.id), ttl + 86400, json.dumps(token_data))
    await safe_delete(_gcal_state_key(current_user.id))

    # Store connection status in user's business_profile
    profile = dict(current_user.business_profile or {})
    profile["google_calendar_connected"] = True
    current_user.business_profile = profile
    await db.commit()

    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    return {"connected": True, "redirect_url": f"{frontend_url}/dashboard/settings?gcal=connected"}


@router.get("/google-calendar/status")
async def google_calendar_status(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Check whether Google Calendar is connected for this user."""
    token_raw = await safe_get(_gcal_token_key(current_user.id))
    profile = current_user.business_profile or {}
    connected = bool(token_raw) or bool(profile.get("google_calendar_connected"))
    return {
        "connected": connected,
        "has_token": bool(token_raw),
    }


# ---------------------------------------------------------------------------
# WhatsApp
# ---------------------------------------------------------------------------

class WhatsAppConnectRequest(BaseModel):
    phone_number: str


@router.post("/whatsapp/connect")
async def whatsapp_connect(
    data: WhatsAppConnectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set up WhatsApp notifications for this user.

    The phone number is stored as the user's whatsapp_number and used
    to send call summaries and escalation alerts.
    """
    phone = data.phone_number.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone_number is required")

    current_user.whatsapp_number = phone
    profile = dict(current_user.business_profile or {})
    profile["whatsapp_connected"] = True
    profile["whatsapp_number"] = phone
    current_user.business_profile = profile
    await db.commit()
    await db.refresh(current_user)

    return {
        "connected": True,
        "phone_number": phone,
        "message": "WhatsApp notifications will be sent to this number for call summaries and urgent alerts.",
    }


@router.get("/whatsapp/status")
async def whatsapp_status(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Check WhatsApp notification status for this user."""
    profile = current_user.business_profile or {}
    connected = bool(current_user.whatsapp_number) and bool(profile.get("whatsapp_connected"))
    return {
        "connected": connected,
        "phone_number": current_user.whatsapp_number,
        "phone_verified": current_user.phone_verified,
    }
