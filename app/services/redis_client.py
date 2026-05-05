from __future__ import annotations

from typing import Any

from app.config import settings

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover
    Redis = None  # type: ignore[assignment]


_redis: Redis | None = None


def get_redis() -> Redis | None:
    global _redis
    if Redis is None or not settings.REDIS_URL:
        return None
    if _redis is None:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=False)
    return _redis


async def ping_redis() -> bool:
    client = get_redis()
    if client is None:
        return False
    try:
        await client.ping()
        return True
    except Exception:
        return False


async def safe_get(key: str) -> Any:
    client = get_redis()
    if client is None:
        return None
    return await client.get(key)


async def safe_setex(key: str, ttl: int, value: Any) -> None:
    client = get_redis()
    if client is None:
        return
    await client.setex(key, ttl, value)
