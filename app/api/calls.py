from fastapi import APIRouter, Depends

from app.dependencies import get_current_user

router = APIRouter(prefix="/api/calls", tags=["calls"])


@router.get("/")
async def list_calls(_: dict = Depends(get_current_user)) -> list[dict]:
    return []
