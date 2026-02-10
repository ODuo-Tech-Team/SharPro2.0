"""
SharkPro V2 - Async Redis Client

Provides a singleton async Redis connection and helper functions
for the debounce buffer used by the worker.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import redis.asyncio as aioredis

from src.config import get_settings

logger = logging.getLogger(__name__)

_redis: Optional[aioredis.Redis] = None
_lock = asyncio.Lock()


async def get_redis() -> aioredis.Redis:
    """Return a singleton async Redis client."""
    global _redis
    async with _lock:
        if _redis is None:
            settings = get_settings()
            logger.info("Connecting to Redis at %s", settings.redis_url)
            _redis = aioredis.from_url(
                settings.redis_url,
                decode_responses=True,
                max_connections=20,
            )
            # Verify connectivity
            await _redis.ping()
            logger.info("Redis connection established.")
    return _redis


async def push_to_buffer(conversation_id: int, content: str, ttl_seconds: int = 2) -> int:
    """
    Append *content* to the conversation buffer list and reset the TTL.

    Returns the current length of the buffer after the push.
    """
    r = await get_redis()
    key = f"buffer:{conversation_id}"
    pipe = r.pipeline(transaction=True)
    pipe.rpush(key, content)
    pipe.expire(key, ttl_seconds)
    results = await pipe.execute()
    length: int = results[0]  # RPUSH returns the new list length
    logger.debug("Buffer '%s' now has %d item(s).", key, length)
    return length


async def get_buffer(conversation_id: int) -> list[str]:
    """Return all messages stored in the conversation buffer."""
    r = await get_redis()
    key = f"buffer:{conversation_id}"
    items: list[str] = await r.lrange(key, 0, -1)
    return items


async def delete_buffer(conversation_id: int) -> None:
    """Remove the conversation buffer key entirely."""
    r = await get_redis()
    key = f"buffer:{conversation_id}"
    await r.delete(key)
    logger.debug("Buffer '%s' deleted.", key)


async def buffer_exists(conversation_id: int) -> bool:
    """Check whether the buffer key still exists (has not expired)."""
    r = await get_redis()
    key = f"buffer:{conversation_id}"
    return bool(await r.exists(key))


async def close() -> None:
    """Gracefully close the Redis connection pool."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        logger.info("Redis connection closed.")
