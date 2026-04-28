from contextlib import asynccontextmanager
from pathlib import Path
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_models
from app.routes import agents, auth, billing, calls, dashboard, webhooks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("oneclerk")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.DATABASE_URL:
        try:
            await init_models()
            logger.info("Database tables ensured.")
        except Exception:  # pragma: no cover
            logger.exception("Failed to initialize database tables")
    else:
        logger.warning("DATABASE_URL is not set — DB-backed routes will return 500.")
    yield


app = FastAPI(
    title="OneClerk API",
    description="The voice AI receptionist that answers your business calls.",
    version="1.0.0",
    lifespan=lifespan,
)

allowed_origins = ["*"] if not settings.FRONTEND_URL else [settings.FRONTEND_URL, "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(calls.router)
app.include_router(dashboard.router)
app.include_router(billing.router)
app.include_router(webhooks.router)

_STATIC_DIR = Path(__file__).parent / "static"
_HAS_STATIC = _STATIC_DIR.exists()
if _HAS_STATIC:
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def root():
    """Serve the SPA at the root URL. Falls back to API info when no UI bundle."""
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html")
    return {
        "product": "OneClerk",
        "tagline": "Your phone rings. OneClerk handles it.",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT or "development",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/app", include_in_schema=False)
async def dashboard_app():
    """Legacy alias — keeps old /app links working."""
    if _HAS_STATIC:
        return FileResponse(_STATIC_DIR / "index.html")
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
        "environment": settings.ENVIRONMENT or "development",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "product": "OneClerk",
        "database_configured": bool(settings.DATABASE_URL),
        "openai_configured": bool(settings.OPENAI_API_KEY),
        "twilio_configured": bool(
            settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN
        ),
        "elevenlabs_configured": bool(settings.ELEVENLABS_API_KEY),
        "stripe_configured": bool(settings.STRIPE_SECRET_KEY),
    }
