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


async def set_ai_responding(conversation_id: int, ttl_seconds: int = 15) -> None:
    """
    Mark that the AI is about to send a message for this conversation.

    The webhook uses this to distinguish AI-sent messages from human agent
    messages (both arrive as message_type=1 outgoing).
    Short TTL (15s) - just enough to cover the API round-trip.
    """
    r = await get_redis()
    key = f"ai_responding:{conversation_id}"
    await r.set(key, "1", ex=ttl_seconds)


async def is_ai_responding(conversation_id: int) -> bool:
    """Check whether the AI recently sent a message for this conversation."""
    r = await get_redis()
    key = f"ai_responding:{conversation_id}"
    return bool(await r.exists(key))


async def set_human_takeover(conversation_id: int, ttl_seconds: int = 86400) -> None:
    """
    Flag a conversation as taken over by a human agent.

    The AI will not respond to this conversation until the flag is cleared.
    Default TTL is 24 hours (auto-cleanup safety net).
    """
    r = await get_redis()
    key = f"human_takeover:{conversation_id}"
    await r.set(key, "1", ex=ttl_seconds)
    logger.info("Human takeover SET for conversation %d (ttl=%ds).", conversation_id, ttl_seconds)


async def is_human_takeover(conversation_id: int) -> bool:
    """Check whether a human agent has taken over a conversation."""
    r = await get_redis()
    key = f"human_takeover:{conversation_id}"
    return bool(await r.exists(key))


async def clear_human_takeover(conversation_id: int) -> None:
    """Remove the human takeover flag, allowing the AI to respond again."""
    r = await get_redis()
    key = f"human_takeover:{conversation_id}"
    await r.delete(key)
    logger.info("Human takeover CLEARED for conversation %d.", conversation_id)


async def close() -> None:
    """Gracefully close the Redis connection pool."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        logger.info("Redis connection closed.")
