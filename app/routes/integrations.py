"""Third-party integration endpoints.

Supported integrations
----------------------
* Google Calendar — OAuth 2.0 flow; stores refresh token in User.business_profile
* WhatsApp Business — Telnyx WhatsApp API; status check for the dashboard

These endpoints are intentionally lightweight: they validate credentials,
persist tokens, and return a status object the frontend can render.  The
heavy lifting (sending messages, creating calendar events) is done by the
existing service modules (whatsapp.py, booking.py).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.database import get_db
from app.models import User
from app.routes.auth import get_current_user

logger = logging.getLogger("oneclerk.integrations")
router = APIRouter(prefix="/integrations", tags=["integrations"])


# ---------------------------------------------------------------------------
# Google Calendar
# ---------------------------------------------------------------------------

class GoogleCalendarConnectRequest(BaseModel):
    """Payload sent by the frontend after the user completes the Google OAuth
    consent screen.  The frontend exchanges the authorization code for tokens
    using the backend (or passes the code here for server-side exchange).
    """
    authorization_code: str
    redirect_uri: str


@router.post("/google-calendar/connect")
async def google_calendar_connect(
    data: GoogleCalendarConnectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Exchange a Google OAuth authorization code for access + refresh tokens
    and persist the refresh token in the user's business_profile JSONB column.

    Requires the ``google-auth-oauthlib`` package and the following env vars:
      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
    """
    google_client_id = getattr(settings, "GOOGLE_CLIENT_ID", None)
    google_client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", None)

    if not google_client_id or not google_client_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Calendar integration is not configured. "
                "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
            ),
        )

    try:
        from google_auth_oauthlib.flow import Flow  # type: ignore

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": google_client_id,
                    "client_secret": google_client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=["https://www.googleapis.com/auth/calendar"],
            redirect_uri=data.redirect_uri,
        )
        flow.fetch_token(code=data.authorization_code)
        credentials = flow.credentials

        profile = dict(current_user.business_profile or {})
        profile["google_calendar"] = {
            "connected": True,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": google_client_id,
            "scopes": list(credentials.scopes or []),
        }
        current_user.business_profile = profile
        flag_modified(current_user, "business_profile")
        await db.commit()

        return {
            "connected": True,
            "message": "Google Calendar connected successfully.",
            "scopes": list(credentials.scopes or []),
        }

    except ImportError:
        raise HTTPException(
            status_code=503,
            detail=(
                "google-auth-oauthlib is not installed. "
                "Add it to requirements.txt to enable Google Calendar."
            ),
        )
    except Exception as exc:
        logger.exception("Google Calendar OAuth exchange failed")
        raise HTTPException(
            status_code=502,
            detail=f"Google OAuth error: {exc}",
        ) from exc


@router.get("/google-calendar/status")
async def google_calendar_status(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return whether Google Calendar is connected for the current user."""
    profile = current_user.business_profile or {}
    gc = profile.get("google_calendar", {})
    connected = bool(gc.get("connected") and gc.get("refresh_token"))
    return {
        "connected": connected,
        "scopes": gc.get("scopes", []) if connected else [],
        "message": (
            "Google Calendar is connected."
            if connected
            else "Google Calendar is not connected."
        ),
    }


# ---------------------------------------------------------------------------
# WhatsApp Business (via Telnyx)
# ---------------------------------------------------------------------------

class WhatsAppConnectRequest(BaseModel):
    """Payload to register a WhatsApp Business number via Telnyx."""
    phone_number: str
    display_name: str | None = None


@router.post("/whatsapp/connect")
async def whatsapp_connect(
    data: WhatsAppConnectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Register a WhatsApp Business number for the current user.

    Stores the number in User.whatsapp_number so the notification service
    can send call summaries and escalation alerts via Telnyx WhatsApp.
    """
    number = data.phone_number.strip()
    if not number:
        raise HTTPException(status_code=400, detail="phone_number is required")

    if not (settings.TELNYX_API_KEY and settings.WHATSAPP_FROM and settings.WHATSAPP_API_URL):
        raise HTTPException(
            status_code=503,
            detail=(
                "WhatsApp integration is not configured. "
                "Set TELNYX_API_KEY, WHATSAPP_FROM, and WHATSAPP_API_URL."
            ),
        )

    # Persist the number so the whatsapp service can use it
    current_user.whatsapp_number = number
    profile = dict(current_user.business_profile or {})
    profile["whatsapp"] = {
        "connected": True,
        "phone_number": number,
        "display_name": data.display_name or "",
        "provider": "telnyx",
    }
    current_user.business_profile = profile
    flag_modified(current_user, "business_profile")
    await db.commit()

    return {
        "connected": True,
        "phone_number": number,
        "provider": "telnyx",
        "message": (
            f"WhatsApp notifications will be sent to {number}. "
            "You'll receive call summaries and urgent alerts there."
        ),
    }


@router.get("/whatsapp/status")
async def whatsapp_status(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return whether WhatsApp notifications are configured for the current user."""
    profile = current_user.business_profile or {}
    wa = profile.get("whatsapp", {})
    # Also check the top-level whatsapp_number field (set by phone OTP verification)
    number = wa.get("phone_number") or current_user.whatsapp_number
    telnyx_ready = bool(
        settings.TELNYX_API_KEY and settings.WHATSAPP_FROM and settings.WHATSAPP_API_URL
    )
    connected = bool(number and telnyx_ready)
    return {
        "connected": connected,
        "phone_number": number or None,
        "provider": wa.get("provider", "telnyx") if connected else None,
        "telnyx_configured": telnyx_ready,
        "message": (
            f"WhatsApp notifications active on {number}."
            if connected
            else "WhatsApp is not configured."
        ),
    }
