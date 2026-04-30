from fastapi import APIRouter, Depends
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

@router.get("/")
async def list_integrations(current_user: dict = Depends(get_current_user)):
    return []

@router.post("/google-calendar/connect")
async def connect_calendar(current_user: dict = Depends(get_current_user)):
    return {"url": "https://accounts.google.com/..."}

@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    return {"google_calendar": "connected", "whatsapp": "active"}
