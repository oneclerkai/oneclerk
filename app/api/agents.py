from fastapi import APIRouter, Depends

from app.dependencies import get_current_user

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("/")
async def list_agents(_: dict = Depends(get_current_user)) -> list[dict]:
    return []
