from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_db
from app.models.call import Call
from app.models.agent import Agent
from app.dependencies import get_current_user
from datetime import datetime

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def _get_stats_data(current_user: dict, db: AsyncSession) -> dict:
    user_id = current_user["sub"]
    today = datetime.utcnow().date()

    calls_today = (await db.execute(
        select(func.count(Call.id)).where(Call.user_id == user_id, Call.created_at >= today)
    )).scalar() or 0

    calls_total = (await db.execute(
        select(func.count(Call.id)).where(Call.user_id == user_id)
    )).scalar() or 0

    bookings = (await db.execute(
        select(func.count(Call.id)).where(Call.user_id == user_id, Call.appointment_booked == True)
    )).scalar() or 0

    urgent_calls = (await db.execute(
        select(func.count(Call.id)).where(Call.user_id == user_id, Call.escalated == True)
    )).scalar() or 0

    return {
        "calls_today": calls_today,
        "calls_total": calls_total,
        "bookings": bookings,
        "urgent_calls": urgent_calls,
        "answer_rate": 1.0,
        "total_minutes": 0.0,
    }


@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get_stats_data(current_user, db)


@router.get("/overview")
async def get_overview(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get_stats_data(current_user, db)
