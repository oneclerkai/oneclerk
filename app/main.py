from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_models
from app.routes import agents, auth, calls, dashboard, webhooks

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
app.include_router(webhooks.router)


@app.get("/")
async def root() -> dict:
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
    }
