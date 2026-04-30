from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Agent, Call, User
from app.routes.auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    total_calls = (
        await db.execute(select(func.count(Call.id)).where(Call.user_id == current_user.id))
    ).scalar_one()
    handled = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id, Call.status == "completed"
            )
        )
    ).scalar_one()
    urgent = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id, Call.is_urgent.is_(True)
            )
        )
    ).scalar_one()
    bookings = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.user_id == current_user.id, Call.booking_made.is_(True)
            )
        )
    ).scalar_one()
    minutes = (
        await db.execute(
            select(func.coalesce(func.sum(Call.duration_seconds), 0)).where(
                Call.user_id == current_user.id
            )
        )
    ).scalar_one() or 0
    agents = (
        await db.execute(select(func.count(Agent.id)).where(Agent.user_id == current_user.id))
    ).scalar_one()

    return {
        "total_agents": int(agents),
        "total_calls": int(total_calls),
        "calls_handled": int(handled),
        "urgent_calls": int(urgent),
        "bookings_made": int(bookings),
        "total_minutes": int(int(minutes) // 60),
    }
