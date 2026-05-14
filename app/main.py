from contextlib import asynccontextmanager
from pathlib import Path
import asyncio
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.config import settings
from app.database import init_models
from app.routes import agents, auth, billing, calls, dashboard, integrations, webhooks
from app.startup_check import check_all_services
from app.services.redis_client import ping_redis
from app.services.synthesis import cleanup_audio_files
from app.services.synthesis import AUDIO_DIR, delete_file_later

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("oneclerk")


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
    title="OneClerk API",
    description="The voice AI receptionist that answers your business calls.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

allowed_origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhooks.router)
app.include_router(auth.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(calls.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")

_STATIC_DIR = Path(__file__).parent / "static"
_HAS_STATIC = _STATIC_DIR.exists()
if _HAS_STATIC:
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


@app.get("/", include_in_schema=False)
async def root():
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html", headers=_NO_CACHE_HEADERS)
    return {
        "product": "OneClerk",
        "tagline": "Your phone rings. OneClerk handles it.",
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


@app.get("/api", include_in_schema=False)
async def api_info() -> dict:
    return {
        "product": "OneClerk",
        "tagline": "Your phone rings. OneClerk handles it.",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "product": "OneClerk",
        "services": settings.service_checklist(),
    }


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
