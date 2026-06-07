from contextlib import asynccontextmanager
from pathlib import Path
import asyncio
import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.config import settings
from app.database import init_models
from app.routes import agents, auth, billing, calls, dashboard, payments, vapi_webhooks, webhooks
from app.startup_check import check_all_services
from app.services.redis_client import ping_redis
from app.services.synthesis import cleanup_audio_files
from app.services.synthesis import AUDIO_DIR, delete_file_later

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("harkly")


@asynccontextmanager
async def lifespan(_: FastAPI):
    check_all_services()
    settings.validate_startup()
    settings.log_service_checklist()

    if settings.DATABASE_URL:
        try:
            await init_models()
            logger.info("Database tables ensured.")
        except Exception:  # pragma: no cover
            logger.exception("Failed to initialize database tables")
    else:
        logger.warning("DATABASE_URL is not set; DB-backed routes will return 500.")

    cleanup_task = asyncio.create_task(_audio_cleanup_loop())
    if settings.REDIS_URL:
        logger.info("Redis reachable=%s", "yes" if await ping_redis() else "no")

    try:
        yield
    finally:
        cleanup_task.cancel()


async def _audio_cleanup_loop() -> None:
    while True:
        try:
            await cleanup_audio_files()
        except Exception:
            logger.exception("Audio cleanup failed")
        await asyncio.sleep(1800)


app = FastAPI(
    title="Harkly AI API",
    description="The voice AI receptionist that answers your business calls.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000", "https://oneclerk.ai"]
if settings.FRONTEND_URL:
    allowed_origins.append(settings.FRONTEND_URL)
import os as _os
_replit_domain = _os.environ.get("REPLIT_DEV_DOMAIN")
if _replit_domain:
    allowed_origins.append(f"https://{_replit_domain}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred. Please try again."})

app.include_router(webhooks.router)
app.include_router(auth.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(calls.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(vapi_webhooks.router)

_STATIC_DIR = Path(__file__).parent / "static"
_HAS_STATIC = _STATIC_DIR.exists()

_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}

# Serve critical JS/CSS files with no-cache so the browser always gets the latest version
_NO_CACHE_STATIC = {"app.js", "styles.css"}


@app.get("/static/{filename:path}", include_in_schema=False)
async def static_files(filename: str):
    if not _HAS_STATIC:
        raise HTTPException(404)
    path = _STATIC_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(404)
    # Strip query params from filename (e.g. app.js?v=106 → app.js)
    base = filename.split("?")[0].rsplit("/", 1)[-1]
    headers = _NO_CACHE_HEADERS if base in _NO_CACHE_STATIC else {}
    media_types = {
        ".js": "application/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
    }
    suffix = path.suffix.lower()
    return FileResponse(path, headers=headers, media_type=media_types.get(suffix))


@app.get("/", include_in_schema=False)
async def root():
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html", headers=_NO_CACHE_HEADERS)
    return {
        "product": "Harkly AI",
        "tagline": "Your phone rings. Harkly AI handles it.",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/app", include_in_schema=False)
async def dashboard_app():
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html", headers=_NO_CACHE_HEADERS)
    return {"detail": "frontend not bundled"}


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.get("/login", include_in_schema=False)
@app.get("/signup", include_in_schema=False)
@app.get("/dashboard", include_in_schema=False)
@app.get("/verify-email", include_in_schema=False)
async def spa_fallback():
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html", headers=_NO_CACHE_HEADERS)
    return {"detail": "frontend not bundled"}


@app.get("/api", include_in_schema=False)
async def api_info() -> dict:
    return {
        "product": "Harkly AI",
        "tagline": "Your phone rings. Harkly AI handles it.",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "product": "Harkly AI",
        "services": settings.service_checklist(),
    }


class DemoChatPayload(BaseModel):
    message: str
    agent_type: str = "Dental clinic front desk"
    language: str = "English (US)"


_DEMO_FALLBACKS = {
    "Dental clinic front desk": "Thanks for calling! I can help you schedule a cleaning, look up your insurance, or transfer you to the doctor. What works best for you?",
    "Hair salon receptionist": "Hey there! Happy to book you in with your stylist, or set you up with someone new. Which would you prefer?",
    "Restaurant host": "Great evening to call! I can get you a table reservation or walk you through tonight's specials. What can I do for you?",
    "HVAC dispatcher": "Thanks for calling! Is this an emergency repair or would you like to schedule a tune-up? I'll get a tech sorted for you.",
    "Law firm intake": "Thank you for reaching out. Can you give me a brief overview of your matter so I can route you to the right attorney?",
}

_DEMO_SYSTEM = (
    "You are {agent_type}, a friendly AI receptionist powered by Harkly AI. "
    "Respond in {language} if it's not English. "
    "Keep your reply to 1–2 natural sentences, warm and professional. "
    "Do not mention you are an AI unless asked."
)


@app.post("/api/demo-chat", include_in_schema=False)
async def demo_chat(payload: DemoChatPayload) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key and payload.message.strip():
        try:
            import openai  # type: ignore
            client = openai.AsyncOpenAI(api_key=api_key)
            system = _DEMO_SYSTEM.format(
                agent_type=payload.agent_type,
                language=payload.language,
            )
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": payload.message},
                ],
                max_tokens=130,
                temperature=0.75,
            )
            return {"response": resp.choices[0].message.content.strip()}
        except Exception:
            logger.exception("demo-chat OpenAI call failed, using fallback")

    fallback = _DEMO_FALLBACKS.get(payload.agent_type, "How can I help you today?")
    return {"response": fallback}


@app.get("/api/audio/{filename}", include_in_schema=False)
async def serve_audio(filename: str) -> FileResponse:
    safe = Path(filename).name
    path = AUDIO_DIR / safe
    # Accept both .wav (µ-law, preferred) and legacy .mp3 files
    if not path.exists() or not (safe.endswith(".wav") or safe.endswith(".mp3")):
        raise HTTPException(404, "audio not found")
    media_type = "audio/wav" if safe.endswith(".wav") else "audio/mpeg"
    asyncio.create_task(delete_file_later(safe, delay_seconds=1800))
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )
