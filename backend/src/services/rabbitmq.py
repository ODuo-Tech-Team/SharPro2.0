"""
SharkPro V2 - RabbitMQ Connection Manager

Provides a robust, reconnecting async connection to RabbitMQ via aio_pika.
All publishing goes through a single durable topic exchange (`bot_events`).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

import aio_pika
from aio_pika import ExchangeType, Message
from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractExchange

from src.config import get_settings

logger = logging.getLogger(__name__)

_connection: Optional[AbstractConnection] = None
_channel: Optional[AbstractChannel] = None
_exchange: Optional[AbstractExchange] = None
_lock = asyncio.Lock()


async def get_connection() -> AbstractConnection:
    """Return a robust AMQP connection, creating one if necessary."""
    global _connection
    async with _lock:
        if _connection is None or _connection.is_closed:
            settings = get_settings()
            logger.info("Connecting to RabbitMQ at %s", settings.rabbitmq_url)
            _connection = await aio_pika.connect_robust(
                settings.rabbitmq_url,
                client_properties={"connection_name": "sharkpro-backend"},
            )
            logger.info("RabbitMQ connection established.")
    return _connection


async def get_channel() -> AbstractChannel:
    """Return a channel, reusing it when possible."""
    global _channel
    connection = await get_connection()
    if _channel is None or _channel.is_closed:
        _channel = await connection.channel()
        await _channel.set_qos(prefetch_count=10)
        logger.info("RabbitMQ channel opened (prefetch=10).")
    return _channel


async def get_exchange() -> AbstractExchange:
    """Declare and return the ``bot_events`` topic exchange."""
    global _exchange
    if _exchange is None:
        channel = await get_channel()
        settings = get_settings()
        _exchange = await channel.declare_exchange(
            settings.rabbitmq_exchange,
            ExchangeType.TOPIC,
            durable=True,
        )
        logger.info("Exchange '%s' declared.", settings.rabbitmq_exchange)
    return _exchange


async def publish_message(
    routing_key: str,
    body: dict[str, Any],
    exchange_name: Optional[str] = None,
) -> None:
    """
    Publish a JSON message to the configured exchange.

    Parameters
    ----------
    routing_key:
        AMQP routing key (e.g. ``"incoming"``).
    body:
        Dictionary that will be serialised to JSON.
    exchange_name:
        Optional override; defaults to the exchange in settings.
    """
    try:
        exchange = await get_exchange()
        message = Message(
            body=json.dumps(body).encode("utf-8"),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )
        await exchange.publish(message, routing_key=routing_key)
        logger.debug("Published message to '%s' with key '%s'.", exchange.name, routing_key)
    except Exception:
        logger.exception("Failed to publish message to RabbitMQ.")
        raise


async def close() -> None:
    """Gracefully close channel and connection."""
    global _connection, _channel, _exchange
    _exchange = None
    if _channel and not _channel.is_closed:
        await _channel.close()
        _channel = None
        logger.info("RabbitMQ channel closed.")
    if _connection and not _connection.is_closed:
        await _connection.close()
        _connection = None
        logger.info("RabbitMQ connection closed.")
