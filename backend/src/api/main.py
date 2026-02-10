"""
SharkPro V2 - FastAPI Application

Provides:
  - GET  /health              -- Health check
  - POST /webhooks/chatwoot   -- Chatwoot webhook ingestion

The app lifecycle manages the RabbitMQ connection so it is opened on
startup and closed gracefully on shutdown.
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from src.config import get_settings
from src.services import rabbitmq as rmq

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Manage long-lived resources."""
    # Startup: open RabbitMQ connection + declare exchange
    logger.info("Starting up -- initialising RabbitMQ connection.")
    await rmq.get_exchange()
    yield
    # Shutdown: close RabbitMQ
    logger.info("Shutting down -- closing RabbitMQ connection.")
    await rmq.close()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SharkPro V2 API",
    version="2.0.0",
    description="Multi-tenant SaaS AI Automation for WhatsApp via Chatwoot.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check() -> dict[str, str]:
    """Simple liveness probe."""
    return {"status": "ok", "service": "sharkpro-api"}


@app.post("/webhooks/chatwoot", status_code=200)
async def chatwoot_webhook(request: Request) -> Response:
    """
    Receive Chatwoot webhook events.

    Only ``message_created`` events with ``message_type == 0`` (incoming)
    are forwarded to the worker via RabbitMQ.  Everything else is
    acknowledged silently.
    """
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        logger.warning("Failed to parse webhook JSON body.")
        return Response(content='{"detail":"invalid json"}', status_code=400, media_type="application/json")

    event: str = body.get("event", "")
    message_type: int | None = body.get("message_type")

    # --- Gate: only process incoming messages ---
    if event != "message_created":
        logger.debug("Ignoring event '%s'.", event)
        return Response(content='{"detail":"event ignored"}', status_code=200, media_type="application/json")

    if message_type != 0:
        logger.debug("Ignoring non-incoming message (message_type=%s).", message_type)
        return Response(content='{"detail":"non-incoming ignored"}', status_code=200, media_type="application/json")

    account_id = body.get("account_id")
    conversation = body.get("conversation", {})
    conversation_id = body.get("conversation_id") or conversation.get("id")

    if not account_id or not conversation_id:
        logger.warning("Missing account_id or conversation_id in webhook payload.")
        return Response(
            content='{"detail":"missing account_id or conversation_id"}',
            status_code=422,
            media_type="application/json",
        )

    logger.info(
        "Incoming message for account=%s conversation=%s. Publishing to RabbitMQ.",
        account_id,
        conversation_id,
    )

    # Fire-and-forget: publish to RabbitMQ
    try:
        await rmq.publish_message(
            routing_key=settings.rabbitmq_routing_key,
            body=body,
        )
    except Exception:
        logger.exception("Failed to publish webhook payload to RabbitMQ.")
        # We still return 200 so Chatwoot doesn't retry indefinitely.
        return Response(
            content='{"detail":"internal error, message not queued"}',
            status_code=200,
            media_type="application/json",
        )

    return Response(content='{"detail":"queued"}', status_code=200, media_type="application/json")
