"""
SharkPro V2 - FastAPI Application

Provides:
  - GET  /health              -- Health check
  - POST /webhooks/chatwoot   -- Chatwoot webhook ingestion

The app lifecycle manages the RabbitMQ connection so it is opened on
startup and closed gracefully on shutdown.
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from src.config import get_settings
from src.services import rabbitmq as rmq
from src.services import redis_client as redis_svc
from src.services import supabase_client as supabase_svc
from src.services import chatwoot as chatwoot_svc
from src.services.transfer import execute_transfer
from src.services.inactivity import process_stale_atendimentos
from src.api.schemas import TransferPayload
from src.api.middleware import check_org_active
from src.api.campaigns import campaign_router
from src.api.instances import instance_router
from src.api.admin import admin_router
from src.api.knowledge import knowledge_router
from src.api.leads import leads_router
from src.api.followup import followup_router
from src.api.simulator import simulator_router
from src.worker.ai_engine import generate_handoff_summary

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

_allowed_origins = [
    "https://sharkpro-rouge.vercel.app",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(campaign_router)
app.include_router(instance_router)
app.include_router(admin_router)
app.include_router(knowledge_router)
app.include_router(leads_router)
app.include_router(followup_router)
app.include_router(simulator_router)


# ---------------------------------------------------------------------------
# Smart Handoff - background summary on human takeover
# ---------------------------------------------------------------------------

async def _send_handoff_summary(account_id: int, conversation_id: int) -> None:
    """Background task: generate AI summary and post as private note in Chatwoot."""
    try:
        org = await supabase_svc.get_organization_by_account_id(account_id)
        if not org:
            return

        # Fetch recent messages from Chatwoot
        messages = await chatwoot_svc.get_messages(
            url=org["chatwoot_url"],
            token=org["chatwoot_token"],
            account_id=account_id,
            conversation_id=conversation_id,
        )

        if not messages:
            return

        # Generate summary via GPT-4o-mini
        summary = await generate_handoff_summary(messages)

        # Post as private note
        note_content = (
            "**Resumo da IA (Smart Handoff)**\n\n"
            f"{summary}"
        )
        await chatwoot_svc.send_private_message(
            url=org["chatwoot_url"],
            token=org["chatwoot_token"],
            account_id=account_id,
            conversation_id=conversation_id,
            content=note_content,
        )
        logger.info("Smart Handoff summary posted for conversation %d.", conversation_id)
    except Exception:
        logger.warning("Failed to send handoff summary for conversation %d.", conversation_id, exc_info=True)


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

    Handles three scenarios:
      1. ``message_created`` with ``message_type == 0`` (incoming from customer)
         → Forward to RabbitMQ for AI processing.
      2. ``message_created`` with ``message_type == 1`` (outgoing from human agent)
         → Set human-takeover flag so AI stops responding.
      3. ``conversation_status_changed`` to ``pending``
         → Clear human-takeover flag so AI can respond again.
    """
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        logger.warning("Failed to parse webhook JSON body.")
        return Response(content='{"detail":"invalid json"}', status_code=400, media_type="application/json")

    event: str = body.get("event", "")
    message_type = body.get("message_type")

    # Extract account_id and conversation_id from multiple possible locations
    conversation = body.get("conversation", {})
    account = body.get("account", {})

    account_id = (
        body.get("account_id")
        or account.get("id")
        or conversation.get("account_id")
    )
    conversation_id = (
        body.get("conversation_id")
        or conversation.get("id")
        or conversation.get("display_id")
    )

    # ==================================================================
    # GLOBAL INBOX GUARD — blocks ALL events from wrong inboxes.
    # This is the FIRST check, before any event handling, so the AI
    # never touches conversations from other inboxes (no responses,
    # no Smart Handoff, no takeover flags, nothing).
    # ==================================================================
    webhook_inbox_id = (
        conversation.get("inbox_id")
        or body.get("inbox", {}).get("id")
    )
    if webhook_inbox_id and account_id:
        valid_inboxes = await supabase_svc.get_org_inbox_ids(int(account_id))
        if valid_inboxes:
            if int(webhook_inbox_id) not in valid_inboxes:
                logger.warning(
                    "GLOBAL INBOX GUARD: event '%s' from inbox %s rejected (valid inboxes: %s).",
                    event, webhook_inbox_id, valid_inboxes,
                )
                return Response(
                    content='{"detail":"inbox mismatch, event ignored"}',
                    status_code=200,
                    media_type="application/json",
                )
    elif not webhook_inbox_id and account_id:
        valid_inboxes = await supabase_svc.get_org_inbox_ids(int(account_id))
        if valid_inboxes:
            logger.warning(
                "GLOBAL INBOX GUARD: event '%s' has no inbox_id, rejecting (org has inboxes: %s).",
                event, valid_inboxes,
            )
            return Response(
                content='{"detail":"no inbox_id, event rejected"}',
                status_code=200,
                media_type="application/json",
            )

    # ------------------------------------------------------------------
    # Event: conversation_status_changed → check if back to "pending"
    # ------------------------------------------------------------------
    if event == "conversation_status_changed":
        new_status = (
            conversation.get("status")
            or body.get("status")
            or ""
        )
        # Clear takeover when conversation goes back to "pending" (AI resumes)
        # or "resolved" (conversation closed, no need to keep flag)
        if new_status in ("pending", "resolved") and conversation_id:
            logger.info(
                "Conversation %s status changed to '%s'. Clearing human takeover.",
                conversation_id,
                new_status,
            )
            await redis_svc.clear_human_takeover(int(conversation_id))
            await supabase_svc.set_conversation_ai_status(int(conversation_id), "active")
            return Response(content='{"detail":"takeover cleared"}', status_code=200, media_type="application/json")
        logger.info("Conversation status changed to '%s'. Ignoring.", new_status)
        return Response(content='{"detail":"status change ignored"}', status_code=200, media_type="application/json")

    # ------------------------------------------------------------------
    # Event: conversation_updated → detect sale labels
    # ------------------------------------------------------------------
    if event == "conversation_updated":
        labels: list[str] = conversation.get("labels", [])
        labels_lower = {l.lower() for l in labels}
        conv_id = int(conversation_id) if conversation_id else 0

        # --- Pipeline: detect labels and update pipeline_status ---
        if conv_id and account_id:
            pipeline_update: str | None = None
            if labels_lower & {"venda_realizada", "venda_concluida"}:
                pipeline_update = "venda_confirmada"
            elif labels_lower & {"orcamento_enviado", "orcamento"}:
                pipeline_update = "orcamento_enviado"
            elif labels_lower & {"perdido", "lost"}:
                pipeline_update = "perdido"

            if pipeline_update:
                try:
                    await supabase_svc.update_lead_by_conversation(conv_id, {
                        "pipeline_status": pipeline_update,
                    })
                    logger.info("Pipeline status → '%s' for conversation %d (label).", pipeline_update, conv_id)
                except Exception:
                    logger.warning("Pipeline label update failed for conv %d (non-critical).", conv_id)

        # --- Sale tracking (existing logic) ---
        sale_labels = {"venda_realizada", "venda_concluida", "VENDA_REALIZADA"}
        matched_labels = sale_labels.intersection(set(labels))
        if matched_labels and conversation_id and account_id:
            logger.info(
                "Sale label detected (%s) for conversation %s. Recording sale.",
                matched_labels, conversation_id,
            )
            org = await supabase_svc.get_organization_by_account_id(int(account_id))
            if org:
                await supabase_svc.insert_sale_idempotent(
                    org_id=org["id"],
                    amount=0.0,
                    source="ai",
                    conversation_id=int(conversation_id),
                    confirmed_by="label",
                )
            return Response(content='{"detail":"sale recorded"}', status_code=200, media_type="application/json")
        return Response(content='{"detail":"conversation_updated processed"}', status_code=200, media_type="application/json")

    # ------------------------------------------------------------------
    # Gate: only process message_created events from here
    # ------------------------------------------------------------------
    if event != "message_created":
        logger.info("Ignoring event '%s' (not message_created).", event)
        return Response(content='{"detail":"event ignored"}', status_code=200, media_type="application/json")

    # ------------------------------------------------------------------
    # Outgoing message (human agent) → set human takeover flag
    # But SKIP if the AI itself just sent this message.
    # ------------------------------------------------------------------
    is_outgoing = message_type in (1, "outgoing")
    # Ignore private notes (internal messages between agents)
    is_private = body.get("private", False)

    if is_outgoing and not is_private and conversation_id:
        conv_id = int(conversation_id)
        # Check if this outgoing message was sent by the AI (not a human)
        if await redis_svc.is_ai_responding(conv_id):
            logger.info(
                "Outgoing message for conversation %s is from AI (not human). Ignoring.",
                conversation_id,
            )
            return Response(content='{"detail":"ai message ignored"}', status_code=200, media_type="application/json")

        # Only fire summary on the FIRST human message (takeover not yet active)
        already_taken_over = await redis_svc.is_human_takeover(conv_id)

        logger.info(
            "Human agent message detected for conversation %s (already_takeover=%s).",
            conversation_id, already_taken_over,
        )
        await redis_svc.set_human_takeover(conv_id)
        await supabase_svc.set_conversation_ai_status(conv_id, "paused", status="human")

        # Smart Handoff: generate summary ONLY on first human takeover
        if not already_taken_over and account_id:
            asyncio.create_task(_send_handoff_summary(int(account_id), conv_id))
            # Pipeline: mark lead as transferred on first human takeover
            try:
                await supabase_svc.update_lead_by_conversation(conv_id, {
                    "pipeline_status": "transferido",
                })
            except Exception:
                logger.warning("Pipeline transfer update failed for conv %d (non-critical).", conv_id)

        return Response(content='{"detail":"human takeover set"}', status_code=200, media_type="application/json")

    # ------------------------------------------------------------------
    # /auto command: reactivate AI for this conversation
    # ------------------------------------------------------------------
    content_text: str = body.get("content", "") or ""
    if content_text.strip().lower() == "/auto" and conversation_id:
        conv_id = int(conversation_id)
        logger.info("Command /auto detected for conversation %s. Reactivating AI.", conversation_id)
        await redis_svc.clear_human_takeover(conv_id)
        await supabase_svc.set_conversation_ai_status(conv_id, "active", status="bot")
        # Send private note confirming reactivation
        if account_id:
            org = await supabase_svc.get_organization_by_account_id(int(account_id))
            if org:
                try:
                    await chatwoot_svc.send_private_message(
                        url=org["chatwoot_url"],
                        token=org["chatwoot_token"],
                        account_id=int(account_id),
                        conversation_id=conv_id,
                        content="IA reativada via comando /auto",
                    )
                except Exception:
                    logger.warning("Failed to send /auto confirmation note.")
        return Response(content='{"detail":"ai reactivated"}', status_code=200, media_type="application/json")

    # ------------------------------------------------------------------
    # Incoming message (customer) → forward to RabbitMQ for AI
    # ------------------------------------------------------------------
    is_incoming = message_type in (0, "incoming")
    if not is_incoming:
        logger.info("Ignoring non-incoming message (message_type=%s, event=%s).", message_type, event)
        return Response(content='{"detail":"non-incoming ignored"}', status_code=200, media_type="application/json")

    # ------------------------------------------------------------------
    # GROUP GUARD: never respond to group conversations
    # ------------------------------------------------------------------
    conversation_data = body.get("conversation", {})
    additional_attrs = conversation_data.get("additional_attributes") or {}
    group_source_id = (conversation_data.get("contact_inbox") or {}).get("source_id", "")

    if additional_attrs.get("type") == "group" or "@g.us" in group_source_id:
        logger.info(
            "Group conversation detected (conversation=%s). Ignoring.",
            conversation_id,
        )
        return Response(
            content='{"detail":"group conversation ignored"}',
            status_code=200,
            media_type="application/json",
        )

    if not account_id or not conversation_id:
        logger.warning(
            "Missing account_id or conversation_id. Keys in payload: %s",
            list(body.keys()),
        )
        return Response(
            content='{"detail":"missing account_id or conversation_id"}',
            status_code=422,
            media_type="application/json",
        )

    # Inbox already validated by GLOBAL INBOX GUARD above.

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
        return {"resposta": "Erro na transferência."}


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


@app.post("/api/conversations/{conversation_id}/reactivate", status_code=200)
async def reactivate_ai(conversation_id: int, account_id: int = 0) -> dict[str, str]:
    """Reactivate AI for a conversation (frontend button)."""
    # INBOX GUARD
    if account_id:
        valid_inboxes = await supabase_svc.get_org_inbox_ids(account_id)
        if valid_inboxes:
            org = await supabase_svc.get_organization_by_account_id(account_id)
            if org:
                conv_inbox = await chatwoot_svc.get_conversation_inbox_id(
                    url=org["chatwoot_url"], token=org["chatwoot_token"],
                    account_id=account_id, conversation_id=conversation_id,
                )
                if conv_inbox and conv_inbox not in valid_inboxes:
                    logger.warning("REACTIVATE BLOCKED: conversation %d in inbox %d, valid inboxes: %s.", conversation_id, conv_inbox, valid_inboxes)
                    return {"error": "inbox mismatch"}

    logger.info("Reactivating AI for conversation %d via API.", conversation_id)
    await redis_svc.clear_human_takeover(conversation_id)
    await supabase_svc.set_conversation_ai_status(conversation_id, "active", status="bot")
    return {"detail": "ai reactivated", "conversation_id": str(conversation_id)}


@app.get("/api/dashboard/stats/{account_id}")
async def dashboard_stats(account_id: int) -> dict[str, Any]:
    """Return aggregated dashboard metrics for an organization."""
    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        return {"error": "Organization not found"}
    await check_org_active(org)
    stats = await supabase_svc.get_dashboard_stats(org["id"])
    return {"status": "ok", **stats}


@app.get("/api/chatwoot/conversations/{account_id}")
async def chatwoot_conversations_proxy(
    account_id: int,
    status: str = "open",
    page: int = 1,
    inbox_id: int | None = None,
) -> dict[str, Any]:
    """Proxy Chatwoot conversations list with pagination, status and inbox filter."""
    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        return {"error": "Organization not found"}

    # Get all valid inboxes for this org
    valid_inboxes = await supabase_svc.get_org_inbox_ids(account_id)

    # If client requests a specific inbox, validate it
    if inbox_id and valid_inboxes:
        if inbox_id not in valid_inboxes:
            raise HTTPException(status_code=403, detail="inbox_id not authorized for this organization")
        effective_inbox_id = inbox_id
    elif valid_inboxes:
        # No specific inbox requested - if org has only 1 inbox, use it
        # If multiple inboxes, don't filter (show all) or use first one
        effective_inbox_id = valid_inboxes[0] if len(valid_inboxes) == 1 else inbox_id
    else:
        effective_inbox_id = inbox_id

    data = await chatwoot_svc.list_conversations(
        url=org["chatwoot_url"],
        token=org["chatwoot_token"],
        account_id=account_id,
        status=status,
        page=page,
        inbox_id=effective_inbox_id,
    )
    return data


@app.get("/api/chatwoot/conversations/{account_id}/{conversation_id}/messages")
async def chatwoot_messages_proxy(
    account_id: int,
    conversation_id: int,
) -> dict[str, Any]:
    """Proxy Chatwoot messages for a specific conversation."""
    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        return {"error": "Organization not found"}

    # INBOX GUARD
    valid_inboxes = await supabase_svc.get_org_inbox_ids(account_id)
    if valid_inboxes:
        conv_inbox = await chatwoot_svc.get_conversation_inbox_id(
            url=org["chatwoot_url"], token=org["chatwoot_token"],
            account_id=account_id, conversation_id=conversation_id,
        )
        if conv_inbox and conv_inbox not in valid_inboxes:
            logger.warning("MESSAGES PROXY BLOCKED: conversation %d in inbox %d, valid inboxes: %s.", conversation_id, conv_inbox, valid_inboxes)
            raise HTTPException(status_code=403, detail="conversation inbox not authorized")

    messages = await chatwoot_svc.get_messages(
        url=org["chatwoot_url"],
        token=org["chatwoot_token"],
        account_id=account_id,
        conversation_id=conversation_id,
    )
    return {"payload": messages}


@app.get("/api/sse/messages/{account_id}/{conversation_id}")
async def sse_messages(
    account_id: int,
    conversation_id: int,
    request: Request,
) -> StreamingResponse:
    """SSE endpoint that streams new messages in real-time."""
    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        return Response(status_code=404, content="Organization not found")

    # INBOX GUARD
    valid_inboxes = await supabase_svc.get_org_inbox_ids(account_id)
    if valid_inboxes:
        conv_inbox = await chatwoot_svc.get_conversation_inbox_id(
            url=org["chatwoot_url"], token=org["chatwoot_token"],
            account_id=account_id, conversation_id=conversation_id,
        )
        if conv_inbox and conv_inbox not in valid_inboxes:
            logger.warning("SSE BLOCKED: conversation %d in inbox %d, valid inboxes: %s.", conversation_id, conv_inbox, valid_inboxes)
            return Response(status_code=403, content="inbox mismatch")

    chatwoot_url = org["chatwoot_url"]
    chatwoot_token = org["chatwoot_token"]

    async def event_generator():
        seen_ids: set[int] = set()
        # Fetch initial messages to populate seen_ids
        try:
            initial = await chatwoot_svc.get_messages(
                url=chatwoot_url, token=chatwoot_token,
                account_id=account_id, conversation_id=conversation_id,
            )
            for msg in initial:
                seen_ids.add(msg.get("id", 0))
        except Exception:
            pass

        while True:
            if await request.is_disconnected():
                break
            try:
                messages = await chatwoot_svc.get_messages(
                    url=chatwoot_url, token=chatwoot_token,
                    account_id=account_id, conversation_id=conversation_id,
                )
                new_msgs = [m for m in messages if m.get("id", 0) not in seen_ids]
                for msg in new_msgs:
                    seen_ids.add(msg.get("id", 0))
                    yield f"data: {json.dumps(msg)}\n\n"
            except Exception as exc:
                logger.debug("SSE poll error: %s", exc)
            await asyncio.sleep(1.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/chatwoot/conversations/{account_id}/{conversation_id}/messages")
async def chatwoot_send_message_proxy(
    account_id: int,
    conversation_id: int,
    request: Request,
) -> dict[str, Any]:
    """Send a message to a Chatwoot conversation and set human takeover."""
    # INBOX GUARD — most critical: prevents sending messages to wrong inbox
    valid_inboxes = await supabase_svc.get_org_inbox_ids(account_id)
    if valid_inboxes:
        org_guard = await supabase_svc.get_organization_by_account_id(account_id)
        if org_guard:
            conv_inbox = await chatwoot_svc.get_conversation_inbox_id(
                url=org_guard["chatwoot_url"], token=org_guard["chatwoot_token"],
                account_id=account_id, conversation_id=conversation_id,
            )
            if conv_inbox and conv_inbox not in valid_inboxes:
                logger.error("SEND MESSAGE BLOCKED: conversation %d in inbox %d, valid inboxes: %s.", conversation_id, conv_inbox, valid_inboxes)
                raise HTTPException(status_code=403, detail="conversation inbox not authorized")

    try:
        body = await request.json()
    except Exception:
        return {"error": "Invalid JSON body"}

    content = body.get("content", "").strip()
    if not content:
        return {"error": "Content is required"}

    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        return {"error": "Organization not found"}

    result = await chatwoot_svc.send_message(
        url=org["chatwoot_url"],
        token=org["chatwoot_token"],
        account_id=account_id,
        conversation_id=conversation_id,
        content=content,
    )

    # Human agent sent a message → set takeover
    await redis_svc.set_human_takeover(conversation_id)
    await supabase_svc.set_conversation_ai_status(conversation_id, "paused", status="human")
    logger.info("Human message sent via dashboard for conversation %d. Takeover set.", conversation_id)

    return {"payload": result}


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
