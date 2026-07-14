from __future__ import annotations

import aioredis
import time

from app.config import settings

_redis_client = None


async def get_redis_client():
    global _redis_client
    if _redis_client is None:
        if not settings.REDIS_URL:
            return None
        _redis_client = await aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
    return _redis_client


async def sliding_window_allow(key: str, window_seconds: int, max_count: int) -> bool:
    """Simple Redis sliding-window rate limiter.
    Returns True if allowed, False if rate-limited.
    """
    r = await get_redis_client()
    if r is None:
        return True
    now = int(time.time())
    window_key = f"ratelimit:{key}:{window_seconds}"
    p = r.pipeline()
    # remove entries older than window
    p.zremrangebyscore(window_key, 0, now - window_seconds)
    # add current timestamp
    p.zadd(window_key, {str(now): now})
    # get count
    p.zcard(window_key)
    # set expiry
    p.expire(window_key, window_seconds + 5)
    res = await p.execute()
    count = int(res[2])
    return count <= max_count
