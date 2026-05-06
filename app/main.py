from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting OneClerk.ai...")
    try:
        from app.database import engine, Base
        from app.models import User, Agent, Call, ConversationTurn
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("Database tables ready")
    except Exception as e:
        print(f"Database setup warning: {e}")

    try:
        from app.database import AsyncSessionLocal
        migrations = [
            "ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_minutes FLOAT DEFAULT 0",
            "ALTER TABLE calls ADD COLUMN IF NOT EXISTS billable_minutes FLOAT DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS minutes_used_this_month FLOAT DEFAULT 0",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_minutes FLOAT DEFAULT 0",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS google_calendar_id VARCHAR(255)",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS calendly_url VARCHAR(500)",
        ]
        async with AsyncSessionLocal() as db:
            for sql in migrations:
                try:
                    await db.execute(text(sql))
                except Exception:
                    pass
            await db.commit()
        print("Migrations applied")
    except Exception as e:
        print(f"Migration warning: {e}")

    print("OneClerk.ai ready")
    yield
    print("OneClerk.ai shutting down")


app = FastAPI(
    title="OneClerk.ai API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    from app.config import settings
    return {
        "status": "ok",
        "product": "OneClerk.ai",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT
    }


@app.get("/health/db")
async def health_db():
    try:
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}


@app.get("/")
async def root():
    return {"product": "OneClerk.ai", "docs": "/docs", "health": "/health"}


@app.get("/api/audio/{filename}")
async def serve_audio(filename: str):
    filepath = f"/tmp/audio/{filename}"
    if not os.path.exists(filepath):
        raise HTTPException(404, "Audio not found")
    return FileResponse(filepath, media_type="audio/mpeg")


try:
    from app.api.auth import router as auth_router
    app.include_router(auth_router)
    print("Auth router loaded")
except Exception as e:
    print(f"Auth router failed: {e}")

try:
    from app.api.agents import router as agents_router
    app.include_router(agents_router)
    print("Agents router loaded")
except Exception as e:
    print(f"Agents router failed: {e}")

try:
    from app.api.dashboard import router as dashboard_router
    app.include_router(dashboard_router)
    print("Dashboard router loaded")
except Exception as e:
    print(f"Dashboard router failed: {e}")

try:
    from app.api.webhooks import router as webhooks_router
    app.include_router(webhooks_router)
    print("Webhooks router loaded")
except Exception as e:
    print(f"Webhooks router failed: {e}")

try:
    from app.api.voice_test import router as voice_test_router
    app.include_router(voice_test_router)
    print("Voice test router loaded")
except Exception as e:
    print(f"Voice test router failed: {e}")

try:
    from app.api.billing import router as billing_router
    app.include_router(billing_router)
    print("Billing router loaded")
except Exception as e:
    print(f"Billing router failed: {e}")

try:
    from app.api.demo import router as demo_router
    app.include_router(demo_router)
    print("Demo router loaded")
except Exception as e:
    print(f"Demo router failed: {e}")


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc.errors()[0].get("msg", "Validation error"))}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    from app.config import settings
    if settings.ENVIRONMENT == "production":
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    return JSONResponse(status_code=500, content={"detail": str(exc)})
