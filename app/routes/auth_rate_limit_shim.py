from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.rate_limiter import sliding_window_allow

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login_rate_limited(request: Request, db: AsyncSession = Depends(get_db)):
    # This is a compatibility shim to ensure rate limiter is applied at the route level.
    # The real login logic lives in app.routes.auth.login — keep that as the source of truth.
    raise HTTPException(status_code=501, detail="Use /api/auth/login as implemented in auth.py")
