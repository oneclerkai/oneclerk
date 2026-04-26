from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/twilio")
async def twilio_webhook(request: Request) -> dict:
    form = await request.form()
    return {"received": True, "fields": list(form.keys())}


@router.post("/stripe")
async def stripe_webhook(request: Request) -> dict:
    body = await request.body()
    return {"received": True, "bytes": len(body)}
