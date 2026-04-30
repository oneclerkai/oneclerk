from fastapi import APIRouter, Depends
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/billing", tags=["billing"])

@router.post("/create-checkout")
async def create_checkout(plan: str, current_user: dict = Depends(get_current_user)):
    return {"url": "https://checkout.stripe.com/..."}

@router.post("/create-portal")
async def create_portal(current_user: dict = Depends(get_current_user)):
    return {"url": "https://billing.stripe.com/..."}

@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    return {"tier": "trial", "status": "active"}

@router.get("/usage")
async def get_usage(current_user: dict = Depends(get_current_user)):
    return {"minutes_used": 15, "limit": 60}
