import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import settings
from app.api import auth, agents, calls, dashboard, billing, integrations, webhooks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("oneclerk")

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database import init_models
    await init_models()
    yield


app = FastAPI(
    title="OneClerk.ai API",
    description="AI Voice Receptionist Platform Backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(calls.router)
app.include_router(dashboard.router)
app.include_router(billing.router)
app.include_router(integrations.router)
app.include_router(webhooks.router)


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
        "database": "configured" if settings.DATABASE_URL else "not configured",
        "openai_configured": bool(settings.OPENAI_API_KEY),
        "twilio_configured": False,
        "telnyx_configured": bool(settings.TELNYX_API_KEY),
        "elevenlabs_configured": bool(settings.ELEVENLABS_API_KEY),
        "stripe_configured": bool(settings.STRIPE_SECRET_KEY),
    }


@app.get("/app", response_class=HTMLResponse)
async def serve_app():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text())
    return HTMLResponse(content="<h1>OneClerk</h1>", status_code=200)


if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text())
    return HTMLResponse(content='<script>location.href="/app"</script>', status_code=200)
