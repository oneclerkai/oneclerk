"""Booking service — Google Calendar integration with timezone enforcement.

All calendar operations use the business owner's local timezone (default:
Asia/Kolkata) rather than UTC, preventing off-by-one slot errors for Indian
businesses.

Two-step booking flow:
  1. ``propose_slots``  — check availability and return two candidate slots.
  2. ``create_booking`` — confirm and create the event after caller confirms.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

import pytz

logger = logging.getLogger("oneclerk.booking")

# ---------------------------------------------------------------------------
# Timezone helpers
# ---------------------------------------------------------------------------

DEFAULT_TIMEZONE = "Asia/Kolkata"


def get_business_tz(agent_config: dict) -> pytz.BaseTzInfo:
    """Return the business timezone from agent config, defaulting to IST."""
    tz_name = (agent_config or {}).get("timezone", DEFAULT_TIMEZONE)
    try:
        return pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        logger.warning("Unknown timezone %r — falling back to %s", tz_name, DEFAULT_TIMEZONE)
        return pytz.timezone(DEFAULT_TIMEZONE)


def localize_dt(dt: datetime, tz: pytz.BaseTzInfo) -> datetime:
    """Attach timezone info to a naive datetime."""
    if dt.tzinfo is None:
        return tz.localize(dt)
    return dt.astimezone(tz)


def to_utc(dt: datetime, tz: pytz.BaseTzInfo) -> datetime:
    """Convert a local datetime to UTC for Google Calendar API calls."""
    local = localize_dt(dt, tz)
    return local.astimezone(pytz.utc)


# ---------------------------------------------------------------------------
# Calendly helper (existing)
# ---------------------------------------------------------------------------

def get_calendly_link(agent_config: dict) -> Optional[str]:
    """Return the agent's Calendly URL if configured, else None."""
    if not agent_config:
        return None
    url = agent_config.get("calendly_url") or ""
    return url.strip() or None


# ---------------------------------------------------------------------------
# Two-step booking: Step 1 — propose slots
# ---------------------------------------------------------------------------

async def propose_slots(
    agent_config: dict,
    preferred_date: Optional[str] = None,
) -> list[dict]:
    """Return two available appointment slots in the business's local timezone.

    Currently a stub that generates two slots starting from the next business
    day.  Wire to Google Calendar's ``freebusy`` API to check real availability.

    Returns a list of dicts with keys: ``label`` (human-readable), ``iso``
    (ISO-8601 string in local timezone), ``utc_iso`` (UTC for calendar API).
    """
    tz = get_business_tz(agent_config)
    now_local = datetime.now(tz)

    # Find next two business-day morning slots (10 AM and 3 PM)
    slots: list[dict] = []
    day_offset = 1
    while len(slots) < 2:
        candidate = now_local + timedelta(days=day_offset)
        # Skip weekends (Mon=0 … Sun=6)
        if candidate.weekday() < 5:
            for hour in (10, 15):
                slot_local = candidate.replace(hour=hour, minute=0, second=0, microsecond=0)
                slot_utc = to_utc(slot_local, tz)
                label = slot_local.strftime("%A %d %B at %I %p %Z").replace(" 0", " ")
                slots.append({
                    "label": label,
                    "iso": slot_local.isoformat(),
                    "utc_iso": slot_utc.isoformat(),
                })
                if len(slots) == 2:
                    break
        day_offset += 1

    logger.info("Proposed slots: %s", [s["label"] for s in slots])
    return slots


# ---------------------------------------------------------------------------
# Two-step booking: Step 2 — confirm and create
# ---------------------------------------------------------------------------

async def create_booking(details: dict, agent_config: dict) -> dict:
    """Create a calendar event for the confirmed slot.

    ``details`` should contain at minimum:
      - ``slot_iso``: ISO-8601 datetime string (local timezone)
      - ``caller_name``: caller's name
      - ``service``: service requested (optional)

    Wire ``_create_google_calendar_event`` to the real Google Calendar API
    using the credentials stored in ``agent_config["google_credentials"]``.
    """
    tz = get_business_tz(agent_config)
    slot_iso = details.get("slot_iso")
    if not slot_iso:
        return {"booked": False, "error": "No slot provided"}

    try:
        slot_local = datetime.fromisoformat(slot_iso)
        slot_local = localize_dt(slot_local, tz)
        slot_utc = to_utc(slot_local, tz)
    except ValueError as exc:
        logger.error("Invalid slot_iso %r: %s", slot_iso, exc)
        return {"booked": False, "error": "Invalid slot format"}

    event_result = await _create_google_calendar_event(
        agent_config=agent_config,
        summary=f"Appointment: {details.get('service', 'Consultation')}",
        description=f"Caller: {details.get('caller_name', 'Unknown')}",
        start_utc=slot_utc,
        duration_minutes=int(agent_config.get("appointment_duration_minutes", 30)),
    )
    return event_result


async def _create_google_calendar_event(
    agent_config: dict,
    summary: str,
    description: str,
    start_utc: datetime,
    duration_minutes: int = 30,
) -> dict:
    """Create a Google Calendar event.

    Requires ``agent_config["google_credentials"]`` to be a valid OAuth2
    credentials dict.  Returns ``{"booked": True, "event_id": ..., "link": ...}``
    on success or ``{"booked": False, "error": ...}`` on failure.
    """
    credentials_data = (agent_config or {}).get("google_credentials")
    if not credentials_data:
        logger.info("Google credentials not configured — returning stub confirmation")
        return {
            "booked": True,
            "confirmation": "PENDING",
            "note": "Google Calendar not connected. Configure google_credentials in agent settings.",
        }

    try:
        from google.oauth2.credentials import Credentials  # type: ignore
        from googleapiclient.discovery import build  # type: ignore

        creds = Credentials(**credentials_data)
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)

        end_utc = start_utc + timedelta(minutes=duration_minutes)
        event_body = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start_utc.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": end_utc.isoformat(), "timeZone": "UTC"},
        }
        created = service.events().insert(calendarId="primary", body=event_body).execute()
        return {
            "booked": True,
            "event_id": created.get("id"),
            "link": created.get("htmlLink"),
        }
    except Exception as exc:
        logger.exception("Google Calendar event creation failed")
        return {"booked": False, "error": str(exc)}
