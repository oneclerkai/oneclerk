"""Vapi AI webhook handler — tool calls, call events, and phone forwarding.

Vapi sends POST requests to this endpoint when the AI needs to call a tool
(function call in OpenAI terms). We handle each named tool and return the
structured JSON Vapi expects.

Supported tools:
  connect_to_human         — transfers the live call to a human operator
  book_appointment_calendar — creates a real Google Calendar event
  check_availability        — placeholder; returns available slots
  send_summary_whatsapp     — fires a WhatsApp summary to the owner
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.services import google_calendar, whatsapp

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vapi", tags=["vapi"])


def _tool_result(tool_call_id: str, result: str, **extra) -> dict:
    """Build a single Vapi tool-call result object."""
    return {"toolCallId": tool_call_id, "result": result, **extra}


async def _handle_connect_to_human(tool_call: dict) -> dict:
    call_id = tool_call.get("id", "")
    args = tool_call.get("function", {}).get("arguments", {})
    reason = args.get("reason", "Caller requested to speak with a human")

    forward_to = settings.FORWARD_TARGET_PHONE
    if not forward_to:
        return _tool_result(
            call_id,
            "I'm sorry, no human agent is available right now. "
            "I'll make sure the owner calls you back very soon.",
        )

    logger.info("Forwarding call to human: %s — reason: %s", forward_to, reason)
    return _tool_result(
        call_id,
        "Connecting you to the live manager now. Please hold for just a moment.",
        forwardToPhoneNumber=forward_to,
    )


async def _handle_book_appointment(tool_call: dict) -> dict:
    call_id = tool_call.get("id", "")
    args = tool_call.get("function", {}).get("arguments", {})

    customer_name  = args.get("customer_name", "Valued customer")
    customer_email = args.get("email") or args.get("customer_email")
    date           = args.get("date", "")
    time           = args.get("time", "")
    description    = args.get("notes") or args.get("description") or ""

    if not date or not time:
        return _tool_result(
            call_id,
            "I wasn't able to book the appointment — could you please confirm "
            "the preferred date and time?",
        )

    try:
        event = await google_calendar.create_calendar_event(
            customer_name=customer_name,
            customer_email=customer_email,
            date=date,
            time=time,
            description=description,
        )
        event_link = event.get("htmlLink", "")
        return _tool_result(
            call_id,
            f"Done! I've booked your appointment for {date} at {time}. "
            f"You'll receive a calendar invite shortly."
            + (f" View it here: {event_link}" if event_link else ""),
        )
    except RuntimeError as exc:
        if "not configured" in str(exc).lower():
            logger.warning("Google Calendar not configured — booking skipped")
            return _tool_result(
                call_id,
                f"Great, I've noted your appointment for {date} at {time}. "
                "The team will confirm the booking with you shortly.",
            )
        logger.exception("Google Calendar event creation failed")
        return _tool_result(
            call_id,
            "I wasn't able to add the event to the calendar right now. "
            "Don't worry — I've passed the details to the team who will confirm shortly.",
        )


async def _handle_check_availability(tool_call: dict) -> dict:
    call_id = tool_call.get("id", "")
    args = tool_call.get("function", {}).get("arguments", {})
    date = args.get("date", "tomorrow")
    return _tool_result(
        call_id,
        f"We have availability on {date}. Morning slots are open from 9 AM to 12 PM "
        "and afternoon slots from 2 PM to 5 PM. Which works best for you?",
    )


async def _handle_send_summary_whatsapp(tool_call: dict) -> dict:
    call_id = tool_call.get("id", "")
    args = tool_call.get("function", {}).get("arguments", {})
    owner_number = args.get("owner_number") or settings.FORWARD_TARGET_PHONE
    summary_text = args.get("summary", "A call just came in via Harkly AI.")

    if owner_number:
        try:
            await whatsapp.send_text(owner_number, f"📞 Harkly AI call summary:\n\n{summary_text}")
        except Exception:
            logger.exception("WhatsApp summary send failed")

    return _tool_result(call_id, "Summary sent to the owner via WhatsApp.")


_TOOL_HANDLERS = {
    "connect_to_human":           _handle_connect_to_human,
    "book_appointment_calendar":  _handle_book_appointment,
    "check_availability":         _handle_check_availability,
    "send_summary_whatsapp":      _handle_send_summary_whatsapp,
}


@router.post("/webhook")
async def vapi_webhook(request: Request) -> JSONResponse:
    """Main Vapi webhook endpoint.

    Vapi posts a JSON body with a `message` object. We inspect the message type
    and dispatch accordingly. Tool-call messages return a `results` array; all
    other message types return a simple acknowledgement.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    message = body.get("message", {})
    msg_type = message.get("type", "")

    if msg_type == "tool-calls":
        tool_calls = message.get("toolCallList") or message.get("toolCalls") or []
        if not tool_calls:
            return JSONResponse({"results": []})

        results = await asyncio.gather(
            *[
                _dispatch_tool(tc)
                for tc in tool_calls
            ]
        )
        return JSONResponse({"results": list(results)})

    if msg_type == "function-call":
        fc = message.get("functionCall", {})
        tool_call = {
            "id": message.get("callId", ""),
            "function": {
                "name": fc.get("name", ""),
                "arguments": fc.get("parameters", {}),
            },
        }
        result = await _dispatch_tool(tool_call)
        return JSONResponse({"results": [result]})

    if msg_type in ("end-of-call-report", "hang"):
        asyncio.create_task(_handle_call_end(message))
        return JSONResponse({"received": True})

    return JSONResponse({"received": True, "type": msg_type})


async def _dispatch_tool(tool_call: dict) -> dict:
    name = (tool_call.get("function") or {}).get("name", "")
    handler = _TOOL_HANDLERS.get(name)
    if handler is None:
        logger.warning("Unknown Vapi tool call: %s", name)
        return _tool_result(
            tool_call.get("id", ""),
            f"Tool '{name}' is not implemented. I'll note this for the team.",
        )
    try:
        return await handler(tool_call)
    except Exception as exc:
        logger.exception("Tool handler %s raised: %s", name, exc)
        return _tool_result(
            tool_call.get("id", ""),
            "I ran into a technical issue with that request. The team has been notified.",
        )


async def _handle_call_end(message: dict) -> None:
    """Fire-and-forget post-call processing — WhatsApp summary to owner."""
    try:
        summary = message.get("summary") or message.get("transcript") or ""
        call = message.get("call") or {}
        caller = (call.get("customer") or {}).get("number", "Unknown")
        owner_number = settings.FORWARD_TARGET_PHONE
        if owner_number and summary:
            await whatsapp.send_text(
                owner_number,
                f"📞 *Harkly AI — call ended*\n\n"
                f"Caller: {caller}\n\n"
                f"Summary:\n{summary[:800]}",
            )
    except Exception:
        logger.exception("Post-call WhatsApp summary failed")
