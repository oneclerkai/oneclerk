from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
import logging

logger = logging.getLogger("oneclerk")

class Base(DeclarativeBase):
    pass

_engine = None
_AsyncSessionLocal = None

def get_database_url():
    url = settings.DATABASE_URL
    if not url:
        return None
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # asyncpg does not accept sslmode as a query param — remove it
    if "sslmode=" in url:
        import re
        url = re.sub(r"[?&]sslmode=[^&]*", "", url)
        url = re.sub(r"\?$", "", url)
    return url

def get_engine():
    global _engine
    if _engine is None:
        db_url = get_database_url()
        if not db_url:
            return None
        _engine = create_async_engine(
            db_url,
            echo=False,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20
        )
    return _engine

def get_session_local():
    global _AsyncSessionLocal
    if _AsyncSessionLocal is None:
        engine = get_engine()
        if engine is None:
            return None
        _AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    return _AsyncSessionLocal

async def init_models():
    engine = get_engine()
    if engine is None:
        logger.warning("DATABASE_URL not configured — skipping table creation")
        return
    from app.models import user, agent, call, contact, conversation, integration
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created/verified")

async def get_db():
    session_local = get_session_local()
    if session_local is None:
        raise Exception("Database not configured")
    async with session_local() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
