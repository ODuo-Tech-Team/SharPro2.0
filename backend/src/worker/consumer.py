"""
SharkPro V2 - Worker Consumer

Connects to RabbitMQ and Redis, consumes incoming Chatwoot messages,
implements the debounce-buffer pattern, transcribes audio, runs AI,
tracks sales, and sends responses back through Chatwoot.

Run with:
    python -m src.worker.consumer
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import tempfile
from pathlib import Path
from typing import Any, Optional

import aio_pika
import httpx
from aio_pika import ExchangeType
from aio_pika.abc import AbstractIncomingMessage
from openai import AsyncOpenAI

from src.config import Settings, get_settings
from src.services import chatwoot as chatwoot_svc
from src.services import redis_client as redis_svc
from src.services import supabase_client as supabase_svc
from src.worker.ai_engine import ConversationContext, run_completion

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

settings: Settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# Track pending debounce tasks so we can cancel on shutdown
_debounce_tasks: dict[int, asyncio.Task[None]] = {}
_shutdown_event = asyncio.Event()


# ---------------------------------------------------------------------------
# Audio transcription
# ---------------------------------------------------------------------------

async def _transcribe_audio(data_url: str) -> str:
    """
    Download an audio attachment and transcribe it with OpenAI Whisper.

    Returns the transcribed text.
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    # Download the audio file
    async with httpx.AsyncClient(timeout=60.0) as http:
        response = await http.get(data_url)
        response.raise_for_status()

    # Write to a temp file (Whisper needs a file path / file object)
    suffix = ".ogg"
    if "." in data_url.split("?")[0].split("/")[-1]:
        suffix = "." + data_url.split("?")[0].split("/")[-1].rsplit(".", 1)[-1]

    tmp_dir = tempfile.gettempdir()
    tmp_path = Path(tmp_dir) / f"sharkpro_audio_{os.getpid()}{suffix}"

    try:
        tmp_path.write_bytes(response.content)
        logger.info("Audio downloaded to %s (%d bytes).", tmp_path, len(response.content))

        with open(tmp_path, "rb") as audio_file:
            transcription = await client.audio.transcriptions.create(
                model=settings.whisper_model,
                file=audio_file,
            )

        text = transcription.text.strip()
        logger.info("Audio transcribed: '%s' (%d chars).", text[:80], len(text))
        return text
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


# ---------------------------------------------------------------------------
# Sales tracking
# ---------------------------------------------------------------------------

async def _check_and_record_sale(
    payload: dict[str, Any],
    org: dict[str, Any],
) -> None:
    """
    If the conversation has the ``venda_concluida`` label, insert a sale
    record into Supabase ``sales_metrics``.
    """
    conversation: dict[str, Any] = payload.get("conversation", {})
    labels: list[str] = conversation.get("labels", [])

    if "venda_concluida" in labels:
        org_id: str = org["id"]
        logger.info("Label 'venda_concluida' detected for org %s. Recording sale.", org_id)
        await supabase_svc.insert_sale(
            org_id=org_id,
            amount=0.0,  # Actual amount can be enriched later
            source="ai",
        )


# ---------------------------------------------------------------------------
# Build conversation history from Chatwoot
# ---------------------------------------------------------------------------

async def _build_history(
    org: dict[str, Any],
    account_id: int,
    conversation_id: int,
    max_messages: int = 20,
) -> list[dict[str, str]]:
    """
    Fetch recent Chatwoot messages and convert them to the OpenAI
    messages format (role + content).
    """
    try:
        raw_messages = await chatwoot_svc.get_messages(
            url=org["chatwoot_url"],
            token=org["chatwoot_token"],
            account_id=account_id,
            conversation_id=conversation_id,
        )
    except Exception:
        logger.warning("Could not fetch history for conversation %d; proceeding without it.", conversation_id)
        return []

    history: list[dict[str, str]] = []
    for msg in raw_messages[-max_messages:]:
        content = msg.get("content") or ""
        if not content:
            continue
        # message_type: 0 = incoming (user), 1 = outgoing (assistant)
        role = "user" if msg.get("message_type") == 0 else "assistant"
        history.append({"role": role, "content": content})

    return history


# ---------------------------------------------------------------------------
# Process a fully debounced batch
# ---------------------------------------------------------------------------

async def _process_batch(
    conversation_id: int,
    account_id: int,
    payload: dict[str, Any],
) -> None:
    """
    Called after the debounce window closes.

    1. Collect buffered messages from Redis.
    2. Retrieve org context from Supabase.
    3. Handle audio transcription.
    4. Run AI completion.
    5. Send response via Chatwoot.
    6. Check for sales labels.
    """
    try:
        # 1. Collect buffer
        messages = await redis_svc.get_buffer(conversation_id)
        await redis_svc.delete_buffer(conversation_id)

        if not messages:
            logger.debug("Empty buffer for conversation %d; skipping.", conversation_id)
            return

        combined_text = "\n".join(messages)
        logger.info(
            "Processing %d buffered message(s) for conversation %d.",
            len(messages),
            conversation_id,
        )

        # 2. Retrieve organization context
        org = await supabase_svc.get_organization_by_account_id(account_id)
        if org is None:
            logger.error(
                "No organization for account_id=%d. Cannot process conversation %d.",
                account_id,
                conversation_id,
            )
            return

        system_prompt: str = org.get("system_prompt") or (
            "You are a helpful sales assistant. Be polite, concise, and helpful."
        )

        # 3. Build conversation history
        history = await _build_history(org, account_id, conversation_id)

        # 4. Extract sender contact_id (for lead registration)
        sender = payload.get("sender", {})
        contact_id: Optional[int] = sender.get("id") if sender else None

        # 5. Run AI
        ctx = ConversationContext(
            organization_id=org["id"],
            chatwoot_url=org["chatwoot_url"],
            chatwoot_token=org["chatwoot_token"],
            account_id=account_id,
            conversation_id=conversation_id,
            system_prompt=system_prompt,
            user_message=combined_text,
            contact_id=contact_id,
            history=history,
        )

        ai_response = await run_completion(ctx)

        # 6. Send response to Chatwoot (unless transferred)
        if not ctx.transferred and ai_response.strip():
            await chatwoot_svc.send_message(
                url=org["chatwoot_url"],
                token=org["chatwoot_token"],
                account_id=account_id,
                conversation_id=conversation_id,
                content=ai_response,
            )

        # 7. Sales tracking
        await _check_and_record_sale(payload, org)

    except Exception:
        logger.exception("Error processing batch for conversation %d.", conversation_id)


# ---------------------------------------------------------------------------
# Debounce scheduler
# ---------------------------------------------------------------------------

async def _schedule_debounce(
    conversation_id: int,
    account_id: int,
    payload: dict[str, Any],
) -> None:
    """
    Wait for the debounce TTL to expire, then process the batch.

    If a new message arrives for the same conversation before the timer
    fires, the old task is cancelled and a new one is spawned (the Redis
    buffer EXPIRE is also reset by the caller).
    """
    try:
        await asyncio.sleep(settings.debounce_ttl_seconds)
        # TTL elapsed -- check if the buffer still exists
        # (it might have been consumed by another process in rare edge-cases)
        still_present = await redis_svc.buffer_exists(conversation_id)
        if still_present:
            await _process_batch(conversation_id, account_id, payload)
    except asyncio.CancelledError:
        logger.debug("Debounce task cancelled for conversation %d.", conversation_id)
    except Exception:
        logger.exception("Debounce task failed for conversation %d.", conversation_id)
    finally:
        _debounce_tasks.pop(conversation_id, None)


# ---------------------------------------------------------------------------
# Message handler
# ---------------------------------------------------------------------------

async def _on_message(message: AbstractIncomingMessage) -> None:
    """
    Callback for every message consumed from RabbitMQ.

    Implements the debounce-buffer pattern:
      - Push content to Redis list ``buffer:{conversation_id}``
      - Reset TTL to 2 seconds
      - Cancel any existing debounce task and start a new one
    """
    async with message.process():
        try:
            payload: dict[str, Any] = json.loads(message.body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            logger.error("Could not decode message body. Dropping.")
            return

        account_id: int = payload.get("account_id", 0)
        conversation: dict[str, Any] = payload.get("conversation", {})
        conversation_id: int = payload.get("conversation_id") or conversation.get("id", 0)

        if not account_id or not conversation_id:
            logger.warning("Missing account_id or conversation_id. Dropping message.")
            return

        # --- Audio handling ---
        content: str = payload.get("content") or ""
        attachments: list[dict[str, Any]] = payload.get("attachments", [])

        for attachment in attachments:
            if attachment.get("file_type") == "audio":
                data_url = attachment.get("data_url", "")
                if data_url:
                    try:
                        transcription = await _transcribe_audio(data_url)
                        content = transcription if transcription else content
                    except Exception:
                        logger.exception("Audio transcription failed; using original content.")

        if not content.strip():
            logger.debug("Empty content for conversation %d. Skipping.", conversation_id)
            return

        # --- Push to Redis buffer ---
        await redis_svc.push_to_buffer(
            conversation_id=conversation_id,
            content=content,
            ttl_seconds=settings.debounce_ttl_seconds,
        )

        # --- Reset debounce timer ---
        existing_task = _debounce_tasks.get(conversation_id)
        if existing_task and not existing_task.done():
            existing_task.cancel()

        task = asyncio.create_task(
            _schedule_debounce(conversation_id, account_id, payload)
        )
        _debounce_tasks[conversation_id] = task


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def main() -> None:
    """Connect to RabbitMQ, declare topology, and start consuming."""
    logger.info("Worker starting -- connecting to RabbitMQ.")

    connection = await aio_pika.connect_robust(
        settings.rabbitmq_url,
        client_properties={"connection_name": "sharkpro-worker"},
    )

    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=10)

        # Declare exchange
        exchange = await channel.declare_exchange(
            settings.rabbitmq_exchange,
            ExchangeType.TOPIC,
            durable=True,
        )

        # Declare queue
        queue = await channel.declare_queue(
            settings.rabbitmq_queue,
            durable=True,
        )

        # Bind queue to exchange
        await queue.bind(exchange, routing_key=settings.rabbitmq_routing_key)
        logger.info(
            "Queue '%s' bound to exchange '%s' with key '%s'.",
            settings.rabbitmq_queue,
            settings.rabbitmq_exchange,
            settings.rabbitmq_routing_key,
        )

        # Start consuming
        await queue.consume(_on_message)
        logger.info("Worker is now consuming messages. Press Ctrl+C to stop.")

        # Wait until shutdown signal
        await _shutdown_event.wait()

    # Cleanup
    await redis_svc.close()
    await chatwoot_svc.close()
    logger.info("Worker shut down gracefully.")


def _handle_signal() -> None:
    """Set the shutdown event on SIGINT / SIGTERM."""
    logger.info("Shutdown signal received.")
    _shutdown_event.set()
    # Cancel all pending debounce tasks
    for cid, task in _debounce_tasks.items():
        if not task.done():
            task.cancel()


def run() -> None:
    """Synchronous entry point that sets up the event loop and signals."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Register signal handlers (Unix-style; on Windows they fall back gracefully)
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            # Windows does not support add_signal_handler for all signals
            signal.signal(sig, lambda s, f: _handle_signal())

    try:
        loop.run_until_complete(main())
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt -- shutting down.")
        _shutdown_event.set()
    finally:
        # Let pending tasks finish
        pending = asyncio.all_tasks(loop)
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        loop.close()


# ---------------------------------------------------------------------------
# python -m src.worker.consumer
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    run()
