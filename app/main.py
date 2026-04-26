from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import agents, auth, calls, dashboard, webhooks
from app.config import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(
    title="Voice AI Agent Platform",
    description="Backend API for managing voice AI agents, calls, and conversations.",
    version="0.1.0",
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
        "name": "Voice AI Agent Platform",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT or "development",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "database_configured": bool(settings.DATABASE_URL),
        "redis_configured": bool(settings.REDIS_URL),
    }
