import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import settings
from app.api import auth, agents, calls, dashboard, billing, integrations, webhooks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("oneclerk")

app = FastAPI(
    title="OneClerk.ai API",
    description="AI Voice Receptionist Platform Backend",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(calls.router)
app.include_router(dashboard.router)
app.include_router(billing.router)
app.include_router(integrations.router)
app.include_router(webhooks.router)

# Audio serving endpoint
@app.get("/api/audio/{filename}")
async def get_audio(filename: str):
    file_path = Path("/tmp/oneclerk_audio") / filename
    if file_path.exists():
        return FileResponse(file_path)
    return {"error": "File not found"}, 404

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "database": "configured" if settings.DATABASE_URL else "not configured"
    }

@app.get("/")
async def root():
    return {"message": "Welcome to OneClerk.ai API"}
