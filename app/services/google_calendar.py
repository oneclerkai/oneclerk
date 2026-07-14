from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars"

_cached_tokens: dict[str, dict] = {}


async def _exchange_refresh_for_access(refresh_token: str) -> str:
    """Exchange a refresh token for an access token using app-level client credentials."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise RuntimeError("Google client credentials are not configured")

    # naive cache by refresh token
    cached = _cached_tokens.get(refresh_token)
    if cached and cached.get("expires_at", 0) > datetime.now(timezone.utc).timestamp() + 60:
        return cached["access_token"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            _TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )

    if resp.status_code != 200:
        raise RuntimeError(f"Google token refresh failed: {resp.status_code} {resp.text}")

    data = resp.json()
    access = data["access_token"]
    expires_in = data.get("expires_in", 3600)
    _cached_tokens[refresh_token] = {
        "access_token": access,
        "expires_at": datetime.now(timezone.utc).timestamp() + expires_in,
    }
    return access


async def create_calendar_event(
    customer_name: str,
    customer_email: str | None,
    date: str,
    time: str,
    duration_minutes: int = 30,
    description: str = "",
    access_token: str | None = None,
    calendar_id: str | None = None,
    tz: str | None = None,
) -> dict:
    """Create a Google Calendar event and return the created event dict.

    This function requires either an access_token or will raise. It does not itself
    exchange a refresh token — callers should use _exchange_refresh_for_access.
    """
    if not access_token:
        raise RuntimeError("No access token provided for Google Calendar operation")

    cal_id = calendar_id or settings.GOOGLE_CALENDAR_ID or "primary"
    timezone_str = tz or "Asia/Kolkata"

    # parse date/time into RFC3339
    try:
        if "AM" in time.upper() or "PM" in time.upper():
            parsed_time = datetime.strptime(time.strip(), "%I:%M %p")
        else:
            parsed_time = datetime.strptime(time.strip(), "%H:%M")
    except Exception:
        parsed_time = datetime.strptime("09:00", "%H:%M")

    try:
        parsed_date = datetime.strptime(date.strip(), "%Y-%m-%d").date()
    except Exception:
        parsed_date = datetime.now(timezone.utc).date() + timedelta(days=1)

    start_local = datetime(
        parsed_date.year,
        parsed_date.month,
        parsed_date.day,
        parsed_time.hour,
        parsed_time.minute,
    )

    # Build RFC3339 strings with timezone offset using the timezone name if possible
    # Google accepts "dateTime" with a timeZone field in the event object
    end_local = start_local + timedelta(minutes=duration_minutes)

    event = {
        "summary": f"Appointment with {customer_name}",
        "description": description or None,
        "start": {"dateTime": start_local.isoformat(), "timeZone": timezone_str},
        "end": {"dateTime": end_local.isoformat(), "timeZone": timezone_str},
        "attendees": ([{"email": customer_email}] if customer_email else []),
        "guestsCanInviteOthers": False,
    }

    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    url = f"{_CALENDAR_BASE}/{cal_id}/events?sendUpdates=all"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=event, headers=headers)

    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Google Calendar event creation failed: {resp.status_code} {resp.text}")

    return resp.json()
