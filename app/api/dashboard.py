from fastapi import APIRouter, Depends

from app.dependencies import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def stats(_: dict = Depends(get_current_user)) -> dict:
    return {
        "total_agents": 0,
        "total_calls": 0,
        "total_minutes": 0,
    }
