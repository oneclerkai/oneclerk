from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import safe_db_operation
from app.models import Agent
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vapi", tags=["vapi"])


def _tool_result(tool_call_id: str, result: str, **extra) -> dict:
    return {"toolCallId": tool_call_id, "result": result, **extra}


async def _resolve_agent_forward(agent_id: str) -> str | None:
    async with safe_db_operation() as db:  # type: AsyncSession
        result = await db.execute(__import__("sqlalchemy").select(Agent).where(Agent.id == agent_id))
        agent = result.scalar_one_or_none()
        if not agent:
            return None
        return agent.forwarding_number or agent.telnyx_phone or agent.escalation_phone


async def _handle_connect_to_human(tool_call: dict) -> dict:
    call_id = tool_call.get("id", "")
    args = tool_call.get("function", {}).get("arguments", {})
    reason = args.get("reason", "Caller requested to speak with a human")

    agent_id = args.get("agent_id") or tool_call.get("context", {}).get("agent_id")
    forward_to = None
    if agent_id:
        forward_to = await _resolve_agent_forward(agent_id)

    if not forward_to:
        # fallback to global setting but avoid leaking global in multi-tenant context
        forward_to = settings.FORWARD_TARGET_PHONE

    if not forward_to:
        return _tool_result(
            call_id,
            "I'm sorry, no human agent is available right now. I'll make sure the owner calls you back very soon.",
        )

    logger.info("Forwarding call to human: %s — reason: %s", forward_to, reason)
    return _tool_result(
        call_id,
        "Connecting you to the live manager now. Please hold for just a moment.",
        forwardToPhoneNumber=forward_to,
    )


# Export the handler for the router to use elsewhere; full Vapi handling remains unchanged otherwise.
