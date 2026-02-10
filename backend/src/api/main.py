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
from src.services.transfer import execute_transfer
from src.services.inactivity import process_stale_atendimentos
from src.api.schemas import TransferPayload

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
async def health_check() -> dict[str, Any]:
    """Liveness probe with RabbitMQ status."""
    rmq_ok = False
    try:
        exchange = await rmq.get_exchange()
        rmq_ok = exchange is not None
    except Exception:
        pass
    return {
        "status": "ok" if rmq_ok else "degraded",
        "service": "sharkpro-api",
        "rabbitmq": "connected" if rmq_ok else "disconnected",
    }


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
        logger.info(
            "Message PUBLISHED to RabbitMQ for account=%s conversation=%s (exchange=%s, key=%s).",
            account_id, conversation_id, settings.rabbitmq_exchange, settings.rabbitmq_routing_key,
        )
    except Exception:
        logger.exception(
            "FAILED to publish to RabbitMQ for account=%s conversation=%s.",
            account_id, conversation_id,
        )
        # We still return 200 so Chatwoot doesn't retry indefinitely.
        return Response(
            content='{"detail":"internal error, message not queued"}',
            status_code=200,
            media_type="application/json",
        )

    return Response(content='{"detail":"queued"}', status_code=200, media_type="application/json")


@app.post("/webhooks/transfer", status_code=200)
async def transfer_webhook(payload: TransferPayload) -> dict[str, str]:
    """
    Transfer a conversation to a human specialist.

    This endpoint replicates n8n Flow 2 (Transfer Webhook).
    Called by the AI tool or externally when a transfer is needed.
    """
    logger.info(
        "Transfer webhook received: nome='%s', sessionID='%s', company='%s'.",
        payload.nome, payload.sessionID, payload.company,
    )

    try:
        result = await execute_transfer(
            nome=payload.nome,
            resumo=payload.resumo,
            company=payload.company,
            team_id=payload.team_id,
            session_id=payload.sessionID,
            url_chatwoot_override=payload.url_chatwoot,
            apikey_chatwoot_override=payload.apikey_chatwoot,
        )
        return {"resposta": result}
    except Exception:
        logger.exception("Transfer webhook failed.")
        return {"resposta": "Erro na transferencia."}


@app.get("/debug/rabbitmq")
async def debug_rabbitmq() -> dict[str, Any]:
    """
    Debug endpoint to test RabbitMQ publish/consume connectivity.

    Publishes a test message and returns exchange info.
    """
    try:
        exchange = await rmq.get_exchange()
        return {
            "status": "ok",
            "exchange_name": exchange.name,
            "rabbitmq_url": settings.rabbitmq_url.split("@")[-1],  # hide credentials
            "routing_key": settings.rabbitmq_routing_key,
            "queue": settings.rabbitmq_queue,
        }
    except Exception as exc:
        logger.exception("Debug RabbitMQ failed.")
        return {"status": "error", "detail": str(exc)}


@app.post("/cron/inactivity", status_code=200)
async def inactivity_endpoint() -> dict[str, Any]:
    """
    Manually trigger inactivity check.

    Can be called by an external cron or monitoring tool.
    """
    try:
        count = await process_stale_atendimentos()
        return {"processed": count, "status": "ok"}
    except Exception:
        logger.exception("Inactivity endpoint failed.")
        return {"processed": 0, "status": "error"}
