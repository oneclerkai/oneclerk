from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.database import get_db
from app.models.call import Call
from app.models.agent import Agent
from app.dependencies import get_current_user
import uuid

router = APIRouter(prefix="/calls", tags=["calls"])


def _call_out(c: Call) -> dict:
    return {
        "id": str(c.id),
        "agent_id": str(c.agent_id) if c.agent_id else None,
        "caller_number": c.caller_number,
        "caller_name": c.caller_name,
        "duration_seconds": c.duration_seconds,
        "duration_minutes": c.duration_minutes,
        "status": c.status.value if c.status else "completed",
        "escalated": c.escalated,
        "summary": c.summary,
        "appointment_booked": c.appointment_booked,
        "appointment_details": c.appointment_details,
        "detected_language": c.detected_language,
        "started_at": c.started_at.isoformat() if c.started_at else None,
        "ended_at": c.ended_at.isoformat() if c.ended_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("/recent")
async def recent_calls(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    stmt = select(Call).where(Call.user_id == current_user["sub"]).order_by(desc(Call.created_at)).limit(limit)
    result = await db.execute(stmt)
    calls = result.scalars().all()
    return {"calls": [_call_out(c) for c in calls]}


@router.get("/")
async def list_calls(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Call).where(Call.user_id == current_user["sub"]).order_by(desc(Call.created_at)).limit(100)
    result = await db.execute(stmt)
    calls = result.scalars().all()
    return {"calls": [_call_out(c) for c in calls]}


@router.get("/{call_id}")
async def get_call(
    call_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Call).where(Call.id == call_id, Call.user_id == current_user["sub"])
    result = await db.execute(stmt)
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return _call_out(call)
