"""Call history endpoints plus legacy migration stubs."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Call, User
from app.routes.auth import get_current_user
from app.services.synthesis import AUDIO_DIR, delete_file_later

router = APIRouter(prefix="/calls", tags=["calls"])


@router.get("/audio/{filename}", include_in_schema=False)
async def serve_audio_legacy(filename: str) -> FileResponse:
    safe = Path(filename).name
    path = AUDIO_DIR / safe
    if not path.exists() or not (safe.endswith(".mp3") or safe.endswith(".wav")):
        raise HTTPException(404, "audio not found")
    media_type = "audio/wav" if safe.endswith(".wav") else "audio/mpeg"
    asyncio.create_task(delete_file_later(safe, delay_seconds=1800))
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/recent")
async def recent_calls(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Call)
        .where(Call.user_id == current_user.id)
        .order_by(desc(Call.created_at))
        .limit(20)
    )
    calls = [
        {
            "id": call.id,
            "call_sid": call.call_sid,
            "agent_id": call.agent_id,
            "caller_number": call.caller_number,
            "duration_seconds": call.duration_seconds,
            "status": call.status,
            "is_urgent": call.is_urgent,
            "booking_made": call.booking_made,
            "summary": call.summary,
            "conversation": call.conversation or [],
            "created_at": call.created_at.isoformat() if call.created_at else None,
        }
        for call in result.scalars().all()
    ]
    return {"calls": calls}


@router.get("/{call_id}")
async def get_call(
    call_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Call).where(Call.id == call_id, Call.user_id == current_user.id)
    )
    call = result.scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return {
        "id": call.id,
        "call_sid": call.call_sid,
        "agent_id": call.agent_id,
        "caller_number": call.caller_number,
        "duration_seconds": call.duration_seconds,
        "status": call.status,
        "is_urgent": call.is_urgent,
        "booking_made": call.booking_made,
        "booking_details": call.booking_details,
        "summary": call.summary,
        "conversation": call.conversation or [],
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "ended_at": call.ended_at.isoformat() if call.ended_at else None,
    }
