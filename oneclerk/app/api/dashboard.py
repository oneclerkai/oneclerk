from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_db
from app.models.call import Call
from app.models.agent import Agent
from app.dependencies import get_current_user
import uuid
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/overview")
async def get_overview(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user_id = current_user["sub"]
    today = datetime.utcnow().date()
    
    # Calls today
    stmt_today = select(func.count(Call.id)).where(
        Call.user_id == user_id,
        Call.created_at >= today
    )
    calls_today = (await db.execute(stmt_today)).scalar() or 0
    
    # Bookings
    stmt_bookings = select(func.count(Call.id)).where(
        Call.user_id == user_id,
        Call.appointment_booked == True
    )
    bookings = (await db.execute(stmt_bookings)).scalar() or 0
    
    # Escalations
    stmt_escalations = select(func.count(Call.id)).where(
        Call.user_id == user_id,
        Call.escalated == True
    )
    escalations = (await db.execute(stmt_escalations)).scalar() or 0
    
    return {
        "calls_today": calls_today,
        "answer_rate": 1.0, # Placeholder
        "bookings": bookings,
        "escalations": escalations,
        "total_minutes": 0.0 # Placeholder
    }

@router.get("/calls")
async def list_calls(
    current_user: dict = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db),
    limit: int = 50
):
    stmt = select(Call).where(Call.user_id == current_user["sub"]).order_by(desc(Call.created_at)).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/calls/{call_id}")
async def get_call_detail(call_id: uuid.UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Call).where(Call.id == call_id, Call.user_id == current_user["sub"])
    result = await db.execute(stmt)
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return call

@router.get("/recent-activity")
async def recent_activity(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Return last 10 events as activity
    stmt = select(Call).where(Call.user_id == current_user["sub"]).order_by(desc(Call.created_at)).limit(10)
    calls = (await db.execute(stmt)).scalars().all()
    
    activity = []
    for c in calls:
        status_msg = "booked an appointment" if c.appointment_booked else "called"
        activity.append({
            "id": str(c.id),
            "description": f"Caller {c.caller_number} {status_msg}",
            "time": c.created_at.isoformat()
        })
    return activity

@router.get("/agents/performance")
async def agent_performance(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Agent).where(Agent.user_id == current_user["sub"])
    agents = (await db.execute(stmt)).scalars().all()
    
    performance = []
    for a in agents:
        performance.append({
            "agent_id": str(a.id),
            "name": a.name,
            "calls": a.total_calls,
            "minutes": a.total_minutes
        })
    return performance
