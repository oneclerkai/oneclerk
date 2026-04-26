from fastapi import APIRouter, Request

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def stripe_webhook(request: Request) -> dict:
    body = await request.body()
    return {"received": True, "bytes": len(body)}


@router.post("/whatsapp")
async def whatsapp_inbound(request: Request) -> dict:
    form = await request.form()
    return {"received": True, "fields": list(form.keys())}
