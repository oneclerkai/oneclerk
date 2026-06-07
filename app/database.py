import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger("oneclerk.database")


class Base(DeclarativeBase):
    pass


engine = None
AsyncSessionLocal: Optional[async_sessionmaker[AsyncSession]] = None


def _normalize_url(url: str) -> tuple[str, dict]:
    """Convert a generic Postgres URL to an asyncpg-compatible SQLAlchemy URL.

    asyncpg does not accept libpq-style query params like ``sslmode=require``;
    it expects ``ssl=true`` or an SSLContext via ``connect_args``. Strip those
    params from the URL and translate them into ``connect_args``.
    """
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    connect_args: dict = {}

    sslmode = query.pop("sslmode", None)
    if sslmode in {"require", "verify-ca", "verify-full"}:
        connect_args["ssl"] = True
    elif sslmode in {"disable", "allow", "prefer"}:
        pass

    for key in ("channel_binding", "options", "application_name"):
        query.pop(key, None)

    new_url = urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )
    return new_url, connect_args


def _init_engine() -> None:
    global engine, AsyncSessionLocal
    if engine is not None or not settings.DATABASE_URL:
        return
    url, connect_args = _normalize_url(settings.DATABASE_URL)
    engine = create_async_engine(
        url,
        echo=False,
        future=True,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args=connect_args,
    )
    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


def get_sessionmaker() -> Optional[async_sessionmaker[AsyncSession]]:
    _init_engine()
    return AsyncSessionLocal


@asynccontextmanager
async def safe_db_operation():
    """Async context manager for DB sessions safe to use outside HTTP request scope.

    WebSocket handlers and background tasks cannot use FastAPI's Depends() injection.
    This wrapper ensures the session is always closed even if an exception occurs.
    Auto-commits on success and automatically rolls back on exceptions.

    Usage::

        async with safe_db_operation() as db:
            result = await db.execute(...)
            # auto-committed on context exit
    """
    _init_engine()
    if AsyncSessionLocal is None:
        raise RuntimeError("Database is not configured. Set DATABASE_URL.")
    session: AsyncSession = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


_LIGHTWEIGHT_MIGRATIONS: tuple[str, ...] = (
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username) WHERE username IS NOT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR DEFAULT 'trial'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS business_profile JSONB",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR DEFAULT 'trial'",
    "ALTER TABLE conversation_turns ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'voice'",
    "ALTER TABLE conversation_turns ADD COLUMN IF NOT EXISTS caller_number VARCHAR",
    "ALTER TABLE conversation_turns ADD COLUMN IF NOT EXISTS agent_id VARCHAR",
    "ALTER TABLE conversation_turns ALTER COLUMN call_id DROP NOT NULL",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS twilio_number VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS telnyx_phone VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS telnyx_phone_sid VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS forwarding_number VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS voice_id VARCHAR DEFAULT 'Polly.Aditi'",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS language VARCHAR DEFAULT 'en-IN'",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS calls_this_month INTEGER DEFAULT 0 NOT NULL",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_calls INTEGER DEFAULT 0 NOT NULL",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS escalation_phone VARCHAR",
    "ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_sid VARCHAR",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS telnyx_call_sid VARCHAR",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_number VARCHAR",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS conversation JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'in_progress'",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS escalation_reason TEXT",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS booking_made BOOLEAN DEFAULT FALSE",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS appointment_booked BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS booking_details TEXT",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS summary TEXT",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS started_at TIMESTAMP",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS rollover_minutes INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS rollover_expires_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS usage_alert_80_sent BOOLEAN DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS usage_alert_100_sent BOOLEAN DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS minutes_used_this_month INTEGER DEFAULT 0",
)


async def init_models() -> None:
    """Create tables on startup and run lightweight ALTER TABLE migrations."""
    _init_engine()
    if engine is None:
        return
    from app import models
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _LIGHTWEIGHT_MIGRATIONS:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    _init_engine()
    if AsyncSessionLocal is None:
        raise HTTPException(
            status_code=503,
            detail="Database is not configured. Set DATABASE_URL in the backend environment.",
        )
    async with AsyncSessionLocal() as session:
        yield session
