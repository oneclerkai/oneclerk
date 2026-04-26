from typing import AsyncGenerator, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


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
        # Default is no TLS for asyncpg; allow/prefer behave best-effort.
        pass

    # asyncpg doesn't recognise libpq-only options
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
        pool_pre_ping=True,
        connect_args=connect_args,
    )
    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


_init_engine()


async def init_models() -> None:
    """Create tables on startup if a database is configured."""
    if engine is None:
        return
    # Import models so they are registered with Base.metadata
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    if AsyncSessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    async with AsyncSessionLocal() as session:
        yield session
