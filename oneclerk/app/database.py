from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker 
from sqlalchemy.orm import DeclarativeBase 
from app.config import settings 
 
def get_database_url(): 
    url = settings.DATABASE_URL 
    if url.startswith("postgresql://"): 
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1) 
    return url 
 
engine = create_async_engine( 
    get_database_url(), 
    echo=False, 
    pool_pre_ping=True, 
    pool_size=10, 
    max_overflow=20 
) 
 
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False) 
 
class Base(DeclarativeBase): 
    pass 
 
async def get_db(): 
    async with AsyncSessionLocal() as session: 
        try: 
            yield session 
            await session.commit() 
        except Exception: 
            await session.rollback() 
            raise 
        finally: 
            await session.close() 
