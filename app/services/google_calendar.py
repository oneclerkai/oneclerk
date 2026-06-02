"""Google Calendar integration — OAuth2 refresh-token flow via httpx.

Environment variables required:
  GOOGLE_CLIENT_ID      — OAuth2 client ID
  GOOGLE_CLIENT_SECRET  — OAuth2 client secret
  GOOGLE_REFRESH_TOKEN  — long-lived refresh token (obtained once via OAuth2 consent)
  GOOGLE_CALENDAR_ID    — calendar to write events to (default: 'primary')
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars"

_cached_token: dict | None = None


def _calendar_ready() -> bool:
    return bool(
        settings.GOOGLE_CLIENT_ID
        and settings.GOOGLE_CLIENT_SECRET
        and settings.GOOGLE_REFRESH_TOKEN
    )


async def _get_access_token() -> str:
    global _cached_token
    if (
        _cached_token
        and _cached_token.get("expires_at", 0) > datetime.now(timezone.utc).timestamp() + 60
    ):
        return _cached_token["access_token"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            _TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "refresh_token": settings.GOOGLE_REFRESH_TOKEN,
                "grant_type": "refresh_token",
            },
        )

    if resp.status_code != 200:
        raise RuntimeError(f"Google token refresh failed: {resp.text}")

    data = resp.json()
    _cached_token = {
        "access_token": data["access_token"],
        "expires_at": datetime.now(timezone.utc).timestamp() + data.get("expires_in", 3600),
    }
    return _cached_token["access_token"]


async def create_calendar_event(
    customer_name: str,
    customer_email: str | None,
    date: str,
    time: str,
    duration_minutes: int = 30,
    description: str = "",
    calendar_id: str | None = None,
) -> dict:
    """Create a Google Calendar event and return the created event dict.

    Args:
        customer_name:  Caller / customer full name.
        customer_email: Optional attendee email.
        date:           ISO date string — YYYY-MM-DD.
        time:           HH:MM (24h) or HH:MM AM/PM.
        duration_minutes: Length of the appointment (default 30 min).
        description:    Extra notes appended to the event body.
        calendar_id:    Target calendar (default: settings.GOOGLE_CALENDAR_ID or 'primary').

    Returns:
        The created Google Calendar event object.

    Raises:
        RuntimeError: When credentials are missing or the API call fails.
    """
    if not _calendar_ready():
        raise RuntimeError(
            "Google Calendar is not configured. "
            "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN."
        )

    cal_id = calendar_id or settings.GOOGLE_CALENDAR_ID or "primary"

    try:
        if "AM" in time.upper() or "PM" in time.upper():
            parsed_time = datetime.strptime(time.strip(), "%I:%M %p")
        else:
            parsed_time = datetime.strptime(time.strip(), "%H:%M")
    except ValueError:
        parsed_time = datetime.strptime("09:00", "%H:%M")

    try:
        parsed_date = datetime.strptime(date.strip(), "%Y-%m-%d").date()
    except ValueError:
        parsed_date = datetime.now(timezone.utc).date() + timedelta(days=1)

    start_dt = datetime.combine(parsed_date, parsed_time.time()).replace(
        tzinfo=timezone.utc
    )
    end_dt = start_dt + timedelta(minutes=duration_minutes)

    attendees = []
    if customer_email:
        attendees.append({"email": customer_email})

    event_body = {
        "summary": f"Appointment — {customer_name}",
        "description": (
            f"Booked via Harkly AI\n\n"
            f"Customer: {customer_name}\n"
            f"Email: {customer_email or 'not provided'}\n\n"
            + description
        ).strip(),
        "start": {"dateTime": start_dt.isoformat(), "timeZone": "UTC"},
        "end":   {"dateTime": end_dt.isoformat(),   "timeZone": "UTC"},
        "attendees": attendees,
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email",  "minutes": 1440},
                {"method": "popup",  "minutes": 30},
            ],
        },
    }

    access_token = await _get_access_token()
    url = f"{_CALENDAR_BASE}/{cal_id}/events"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            json=event_body,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Google Calendar API error {resp.status_code}: {resp.text}")

    created = resp.json()
    logger.info(
        "Google Calendar event created id=%s summary=%s",
        created.get("id"),
        created.get("summary"),
    )
    return created
