from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.database import get_db
from app.models import Call, User
from app.services.billing_calculator import calculate_minutes_for_billing

router = APIRouter(prefix="/api/calls", tags=["calls"])


class CallCompleteRequest(BaseModel):
    call_id: str
    duration_seconds: int


@router.post("/complete")
async def complete_call(body: CallCompleteRequest, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(__import__("sqlalchemy").select(Call).where(Call.id == body.call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    call.duration_seconds = int(body.duration_seconds)
    call.ended_at = __import__("datetime").datetime.utcnow()

    await db.commit()

    # Billing: convert seconds to billed minutes and apply free-filter
    FREE_FILTER_SECONDS = int(getattr(__import__("app.config").config.settings, "FREE_FILTER_SECONDS", 20))
    if call.duration_seconds < FREE_FILTER_SECONDS:
        # do not bill
        return {"updated": True, "billed_minutes": 0}

    billed_minutes = (call.duration_seconds + 59) // 60

    # Increment user's minutes_used_this_month
    result = await db.execute(__import__("sqlalchemy").select(User).where(User.id == call.user_id))
    user = result.scalar_one_or_none()
    if user:
        user.minutes_used_this_month = (user.minutes_used_this_month or 0) + billed_minutes
        await db.commit()

    return {"updated": True, "billed_minutes": billed_minutes}
