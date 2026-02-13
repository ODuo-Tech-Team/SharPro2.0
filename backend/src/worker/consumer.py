"""
SharkPro V2 - Worker Consumer

Connects to RabbitMQ and Redis, consumes incoming Chatwoot messages,
implements the debounce-buffer pattern, transcribes audio, runs AI,
tracks sales, and sends responses back through Chatwoot.

Also consumes the `replay_to_message` queue (Flow 1) and runs the
inactivity cron (Flow 3).

Run with:
    python -m src.worker.consumer
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
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
from src.services.inactivity import run_inactivity_cron
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

# Regex to extract [NOTA_INTERNA]...[/NOTA_INTERNA] blocks
_NOTA_INTERNA_RE = re.compile(
    r"\[NOTA_INTERNA\](.*?)\[/NOTA_INTERNA\]",
    re.DOTALL,
)


def _split_internal_notes(text: str) -> tuple[str, list[str]]:
    """
    Split AI response into client-facing text and internal notes.

    Returns (client_text, list_of_internal_notes).
    """
    notes = _NOTA_INTERNA_RE.findall(text)
    client_text = _NOTA_INTERNA_RE.sub("", text).strip()
    notes = [n.strip() for n in notes if n.strip()]
    return client_text, notes


# Regex to extract [QUALIFICACAO]...[/QUALIFICACAO] blocks (pipeline piggyback)
_QUALIFICACAO_RE = re.compile(
    r"\[QUALIFICACAO\](.*?)\[/QUALIFICACAO\]",
    re.DOTALL,
)


# ---------------------------------------------------------------------------
# Lead source detection (digital ads vs organic)
# ---------------------------------------------------------------------------

_DIGITAL_PATTERNS = [
    "[por favor, enviar essa mensagem]",
    "[enviar mensagem]",
    "gostaria de mais informacoes",
    "gostaria de mais informações",
    "vi o anuncio",
    "vi o anúncio",
    "vi no google",
    "vi no instagram",
    "vi no facebook",
    "cliquei no anuncio",
    "cliquei no anúncio",
]


def _detect_lead_source(message: str) -> str:
    """Detect if message is from a digital ad or organic contact."""
    msg_lower = message.lower().strip()
    for pattern in _DIGITAL_PATTERNS:
        if pattern in msg_lower:
            return "digital"
    return "organic"


def _extract_qualification(text: str) -> tuple[str, Optional[dict[str, Any]]]:
    """
    Extract [QUALIFICACAO] JSON from AI response.

    Returns (cleaned_text, qualification_dict_or_None).
    """
    match = _QUALIFICACAO_RE.search(text)
    cleaned = _QUALIFICACAO_RE.sub("", text).strip()
    if not match:
        return cleaned, None
    try:
        raw = match.group(1).strip()
        data = json.loads(raw)
        return cleaned, data
    except (json.JSONDecodeError, ValueError):
        logger.warning("Failed to parse QUALIFICACAO JSON: %s", match.group(1)[:100])
        return cleaned, None


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
    2. Check human takeover flag — skip AI if active.
    3. Retrieve org context from Supabase.
    4. Build conversation history.
    5. Run AI completion.
    6. Send response via Chatwoot.
    7. Check for sales labels.
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

        # 2. Check AI paused (dual-layer: Redis + DB)
        if await redis_svc.is_ai_paused(conversation_id):
            logger.info(
                "Conversation %d is paused (human takeover). Skipping AI response.",
                conversation_id,
            )
            return

        # 3. Retrieve organization context
        _conv = payload.get("conversation", {})
        _batch_inbox_id = _conv.get("inbox_id") or payload.get("inbox", {}).get("id") or None
        org = await supabase_svc.get_organization_by_account_id(account_id, inbox_id=int(_batch_inbox_id) if _batch_inbox_id else None)
        if org is None:
            logger.error(
                "No organization for account_id=%d. Cannot process conversation %d.",
                account_id,
                conversation_id,
            )
            return

        # 3b. Upsert conversation for tracking
        sender = payload.get("sender", {})
        contact_id_for_upsert: Optional[int] = sender.get("id") if sender else None
        try:
            await supabase_svc.upsert_conversation(
                org_id=org["id"],
                conversation_id=conversation_id,
                contact_id=contact_id_for_upsert,
            )
        except Exception:
            logger.warning("Failed to upsert conversation %d (non-critical).", conversation_id)

        # 3b-2. Auto-create lead from incoming message (before AI processes)
        sender_phone = sender.get("phone_number", "") if sender else ""
        sender_name = sender.get("name", "Desconhecido") if sender else "Desconhecido"

        if sender_phone:
            source = _detect_lead_source(combined_text)
            try:
                lead = await supabase_svc.upsert_lead(
                    org_id=org["id"],
                    name=sender_name,
                    phone=sender_phone,
                    contact_id=contact_id_for_upsert,
                    source=source,
                )
                if lead and lead.get("id"):
                    # Only set pipeline for NEW leads (upsert returns status="new" for inserts)
                    # Existing leads already have a pipeline stage — don't overwrite
                    if lead.get("status") == "new":
                        from datetime import datetime, timezone
                        await supabase_svc.update_lead_pipeline(lead["id"], {
                            "pipeline_status": "ia_atendendo",
                            "conversation_id": conversation_id,
                            "last_contact_at": datetime.now(timezone.utc).isoformat(),
                        })
                    logger.info(
                        "Auto-lead: phone=%s, source=%s, conversation=%d, new=%s.",
                        sender_phone, source, conversation_id, lead.get("status") == "new",
                    )
            except Exception:
                logger.warning("Auto-create lead failed for phone=%s (non-critical).", sender_phone)

        system_prompt: str = org.get("system_prompt") or (
            "You are a helpful sales assistant. Be polite, concise, and helpful."
        )

        # 3c. Smart Handoff: keyword-based instant transfer (before AI)
        handoff_config = org.get("ai_handoff_config") or {}
        if handoff_config.get("enabled") and handoff_config.get("keywords"):
            keywords: list[str] = handoff_config["keywords"]
            msg_lower = combined_text.lower().strip()
            matched_keyword = next(
                (kw for kw in keywords if kw.lower() in msg_lower),
                None,
            )
            if matched_keyword:
                logger.info(
                    "Smart Handoff KEYWORD '%s' matched for conversation %d. Transferring directly.",
                    matched_keyword, conversation_id,
                )
                farewell = handoff_config.get("farewell_message") or "Conversa transferida para um atendente humano. Aguarde um momento!"
                handoff_team_id = handoff_config.get("team_id")

                # Send farewell message to customer
                try:
                    await redis_svc.set_ai_responding(conversation_id)
                    await chatwoot_svc.send_message(
                        url=org["chatwoot_url"],
                        token=org["chatwoot_token"],
                        account_id=account_id,
                        conversation_id=conversation_id,
                        content=farewell,
                    )
                except Exception:
                    logger.exception("Failed to send farewell for keyword handoff, conversation %d.", conversation_id)

                # Execute transfer
                sender = payload.get("sender", {})
                contact_id: Optional[int] = sender.get("id") if sender else None
                contact_phone = sender.get("phone_number", "")
                contact_name = sender.get("name", "Desconhecido")

                session_id = f"{account_id}-0-{contact_id or 0}-{conversation_id}-{contact_phone}"
                await redis_svc.set_human_takeover(conversation_id)
                await supabase_svc.set_conversation_ai_status(conversation_id, "paused", status="human")

                try:
                    from src.services.transfer import execute_transfer
                    await execute_transfer(
                        nome=contact_name,
                        resumo=f"Transbordo por palavra-chave: '{matched_keyword}'. Mensagem do cliente: {combined_text[:200]}",
                        company=org.get("name", ""),
                        team_id=handoff_team_id,
                        session_id=session_id,
                        url_chatwoot_override=org["chatwoot_url"],
                        apikey_chatwoot_override=org["chatwoot_token"],
                    )
                except Exception:
                    logger.exception("Keyword handoff transfer failed for conversation %d.", conversation_id)

                logger.info("Smart Handoff completed for conversation %d (keyword='%s').", conversation_id, matched_keyword)
                return

        # 4. Build conversation history
        history = await _build_history(org, account_id, conversation_id)

        # 5. Extract sender contact_id (for lead registration)
        sender = payload.get("sender", {})
        contact_id: Optional[int] = sender.get("id") if sender else None

        # 6. Lookup empresa for extra context (team_id, company, session info)
        empresa = None
        try:
            empresa = await supabase_svc.get_empresa_by_account_and_company(
                account_id, org.get("name", "")
            )
        except Exception:
            logger.warning("Could not fetch empresa for account %d (non-critical).", account_id)

        # 6b. Business hours check
        ai_config = org.get("ai_config") or {}
        bh = ai_config.get("business_hours")
        if bh and bh.get("start") and bh.get("end"):
            try:
                from datetime import datetime
                import zoneinfo
                tz_name = bh.get("timezone", "America/Sao_Paulo")
                try:
                    tz = zoneinfo.ZoneInfo(tz_name)
                except Exception:
                    tz = zoneinfo.ZoneInfo("America/Sao_Paulo")
                now = datetime.now(tz)
                current_time = now.strftime("%H:%M")
                start_time = bh["start"]
                end_time = bh["end"]

                if current_time < start_time or current_time >= end_time:
                    outside_msg = ai_config.get(
                        "outside_hours_message",
                        "Obrigado pelo contato! Nosso horário de atendimento é de "
                        f"{start_time} às {end_time}. Retornaremos em breve!"
                    )
                    logger.info(
                        "Outside business hours (%s not in %s-%s) for conversation %d. Sending auto-reply.",
                        current_time, start_time, end_time, conversation_id,
                    )
                    try:
                        await redis_svc.set_ai_responding(conversation_id)
                        await chatwoot_svc.send_message(
                            url=org["chatwoot_url"],
                            token=org["chatwoot_token"],
                            account_id=account_id,
                            conversation_id=conversation_id,
                            content=outside_msg,
                        )
                    except Exception:
                        logger.exception("Failed to send outside-hours message for conversation %d.", conversation_id)
                    return
            except Exception:
                logger.warning("Business hours check failed (non-critical), proceeding with AI.")

        # 7. Run AI
        logger.info(
            "Running AI for conversation %d (org=%s, empresa=%s).",
            conversation_id, org.get("name"), "found" if empresa else "none",
        )
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
            company=org.get("name"),
            team_id=handoff_config.get("team_id") or (empresa.get("team_id") if empresa else None),
            farewell_message=handoff_config.get("farewell_message"),
            ai_config=org.get("ai_config") or {},
        )

        try:
            ai_response = await run_completion(ctx)
        except Exception:
            logger.exception(
                "AI COMPLETION FAILED for conversation %d. Check OpenAI key and model.",
                conversation_id,
            )
            return

        logger.info(
            "AI response ready: %d chars, transferred=%s, conversation=%d.",
            len(ai_response), ctx.transferred, conversation_id,
        )

        # 7b. Extract pipeline qualification data (piggyback, zero extra cost)
        ai_response, qualification = _extract_qualification(ai_response)
        if qualification and ctx.contact_id:
            try:
                from datetime import datetime, timezone
                lead = await supabase_svc.find_lead_by_contact(org["id"], ctx.contact_id)
                if lead:
                    pipeline_updates: dict[str, Any] = {
                        "last_contact_at": datetime.now(timezone.utc).isoformat(),
                    }
                    val = qualification.get("valor_estimado")
                    if val and float(val) > 0:
                        pipeline_updates["estimated_value"] = float(val)
                    # Auto-qualify if score > 60 and still in ia_atendendo
                    if lead.get("pipeline_status") == "ia_atendendo" and (lead.get("lead_score") or 0) > 60:
                        pipeline_updates["pipeline_status"] = "qualificado"
                    await supabase_svc.update_lead_pipeline(lead["id"], pipeline_updates)
            except Exception:
                logger.warning("Pipeline qualification update failed (non-critical).")

        # 8. Send response to Chatwoot (unless transferred)
        if not ctx.transferred and ai_response.strip():
            # Split client-facing text from internal notes
            client_text, internal_notes = _split_internal_notes(ai_response)

            try:
                # Mark that AI is sending — so the webhook knows this
                # outgoing message is from the bot, not a human agent.
                await redis_svc.set_ai_responding(conversation_id)

                # Send client-facing message (visible to customer)
                if client_text:
                    await chatwoot_svc.send_message(
                        url=org["chatwoot_url"],
                        token=org["chatwoot_token"],
                        account_id=account_id,
                        conversation_id=conversation_id,
                        content=client_text,
                    )
                    logger.info("Response SENT to conversation %d.", conversation_id)

                # Send internal notes as private messages (visible only to agents)
                for note in internal_notes:
                    try:
                        await chatwoot_svc.send_private_message(
                            url=org["chatwoot_url"],
                            token=org["chatwoot_token"],
                            account_id=account_id,
                            conversation_id=conversation_id,
                            content=f"🤖 IA: {note}",
                        )
                        logger.info("Internal note SENT to conversation %d.", conversation_id)
                    except Exception:
                        logger.warning(
                            "Failed to send internal note for conversation %d.",
                            conversation_id,
                        )

                if not client_text and internal_notes:
                    logger.info(
                        "AI response for conversation %d was entirely internal notes (%d notes).",
                        conversation_id, len(internal_notes),
                    )
                elif not client_text and not internal_notes:
                    logger.warning("Empty AI response after parsing for conversation %d.", conversation_id)

            except Exception:
                logger.exception(
                    "FAILED TO SEND response to Chatwoot conversation %d.",
                    conversation_id,
                )
        elif ctx.transferred:
            # Send farewell message to customer when AI decided to transfer
            farewell = ctx.farewell_message or "Conversa transferida para um atendente humano. Obrigado!"
            try:
                await redis_svc.set_ai_responding(conversation_id)
                await chatwoot_svc.send_message(
                    url=org["chatwoot_url"],
                    token=org["chatwoot_token"],
                    account_id=account_id,
                    conversation_id=conversation_id,
                    content=farewell,
                )
                logger.info("Farewell message sent for transferred conversation %d.", conversation_id)
            except Exception:
                logger.exception("Failed to send farewell for conversation %d.", conversation_id)
        else:
            logger.warning("Empty AI response for conversation %d.", conversation_id)

        # 9. Sales tracking
        await _check_and_record_sale(payload, org)

    except Exception:
        logger.exception("CRITICAL ERROR processing batch for conversation %d.", conversation_id)


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
    """
    try:
        logger.info("Debounce started for conversation %d (%ds wait).", conversation_id, settings.debounce_ttl_seconds)
        await asyncio.sleep(settings.debounce_ttl_seconds)
        still_present = await redis_svc.buffer_exists(conversation_id)
        logger.info("Debounce fired for conversation %d (buffer_exists=%s).", conversation_id, still_present)
        if still_present:
            await _process_batch(conversation_id, account_id, payload)
        else:
            logger.warning("Buffer expired before processing for conversation %d!", conversation_id)
    except asyncio.CancelledError:
        logger.info("Debounce task cancelled for conversation %d (new message arrived).", conversation_id)
    except Exception:
        logger.exception("Debounce task failed for conversation %d.", conversation_id)
    finally:
        _debounce_tasks.pop(conversation_id, None)


# ---------------------------------------------------------------------------
# Message handler (incoming messages from Chatwoot)
# ---------------------------------------------------------------------------

async def _on_message(message: AbstractIncomingMessage) -> None:
    """
    Callback for every message consumed from the incoming_messages queue.

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

        # Extract IDs from multiple possible payload locations
        conversation: dict[str, Any] = payload.get("conversation", {})
        account: dict[str, Any] = payload.get("account", {})

        account_id = (
            payload.get("account_id")
            or account.get("id")
            or conversation.get("account_id")
            or 0
        )
        conversation_id = (
            payload.get("conversation_id")
            or conversation.get("id")
            or conversation.get("display_id")
            or 0
        )
        inbox_id = (
            conversation.get("inbox_id")
            or payload.get("inbox", {}).get("id")
            or 0
        )

        if not account_id or not conversation_id:
            logger.warning(
                "Missing account_id or conversation_id. Keys: %s. Dropping.",
                list(payload.keys()),
            )
            return

        logger.info(
            "Message received: account=%d, conversation=%d, inbox=%d.",
            account_id, conversation_id, inbox_id,
        )

        # INBOX GUARD (second layer - first layer is in webhook handler)
        # Ensures AI NEVER responds to messages from wrong inboxes.
        # Uses multi-inbox lookup: checks all whatsapp_instances for the org.
        org_check = await supabase_svc.get_organization_by_account_id(account_id, inbox_id=inbox_id or None)
        valid_inboxes = await supabase_svc.get_org_inbox_ids(account_id)
        if valid_inboxes:
            if not inbox_id:
                logger.warning(
                    "INBOX UNKNOWN (inbox_id=0) for conversation %d but org has inboxes %s. Rejecting.",
                    conversation_id, valid_inboxes,
                )
                return
            if int(inbox_id) not in valid_inboxes:
                logger.warning(
                    "INBOX MISMATCH: message from inbox %d but org allows %s. Skipping.",
                    inbox_id, valid_inboxes,
                )
                return
            logger.info("Inbox check OK: inbox=%d is in org valid inboxes %s.", inbox_id, valid_inboxes)
        elif not org_check:
            logger.error(
                "NO ORGANIZATION FOUND for account_id=%d. Dropping message.",
                account_id,
            )
            return
        else:
            logger.warning(
                "Organization has no inbox_id configured for account_id=%d. "
                "Rejecting message to prevent AI responding in all inboxes.",
                account_id,
            )
            return

        # --- GROUP GUARD: never respond to group conversations (safety net) ---
        conversation_data = payload.get("conversation", {})
        additional_attrs = conversation_data.get("additional_attributes") or {}
        group_source_id = (conversation_data.get("contact_inbox") or {}).get("source_id", "")

        if additional_attrs.get("type") == "group" or "@g.us" in group_source_id:
            logger.info("Group conversation detected in worker (conversation=%d). Skipping.", conversation_id)
            return

        # --- Check if this is a campaign lead replying ---
        sender_info = payload.get("sender", {})
        sender_phone = sender_info.get("phone_number") or ""
        if sender_phone:
            try:
                campaign_lead = await supabase_svc.check_phone_is_campaign_lead(sender_phone)
                if campaign_lead:
                    lead_id = campaign_lead["id"]
                    campaign_id = campaign_lead["campaign_id"]
                    logger.info(
                        "Campaign lead reply detected: phone=%s, lead=%s, campaign=%s.",
                        sender_phone, lead_id, campaign_id,
                    )
                    from datetime import datetime, timezone
                    await supabase_svc.update_campaign_lead_status(
                        lead_id=lead_id,
                        status="replied",
                        extra={"replied_at": datetime.now(timezone.utc).isoformat()},
                    )
                    await supabase_svc.increment_campaign_replied_count(campaign_id)
            except Exception:
                logger.warning("Failed to check campaign lead for phone %s (non-critical).", sender_phone)

        # --- Extract content from multiple possible locations ---
        content: str = (
            payload.get("content")
            or payload.get("body")
            or payload.get("text")
            or ""
        )
        attachments: list[dict[str, Any]] = payload.get("attachments", [])

        logger.info(
            "Content extracted for conversation %d: '%s' (%d chars, %d attachments).",
            conversation_id,
            content[:80] if content else "<empty>",
            len(content),
            len(attachments),
        )

        # --- Audio handling ---
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
            logger.warning(
                "Empty content for conversation %d after extraction. Payload keys: %s. Skipping.",
                conversation_id,
                list(payload.keys()),
            )
            return

        # --- Push to Redis buffer ---
        # TTL must be much longer than debounce sleep to avoid expiring before processing
        buffer_ttl = max(settings.debounce_ttl_seconds * 10, 30)
        await redis_svc.push_to_buffer(
            conversation_id=conversation_id,
            content=content,
            ttl_seconds=buffer_ttl,
        )
        logger.info("Pushed to Redis buffer for conversation %d (ttl=%ds).", conversation_id, buffer_ttl)

        # --- Reset debounce timer ---
        existing_task = _debounce_tasks.get(conversation_id)
        if existing_task and not existing_task.done():
            existing_task.cancel()

        task = asyncio.create_task(
            _schedule_debounce(conversation_id, account_id, payload)
        )
        _debounce_tasks[conversation_id] = task


# ---------------------------------------------------------------------------
# Reply-to-message handler (Flow 1: RabbitMQ replay_to_message queue)
# ---------------------------------------------------------------------------

async def _on_reply_message(message: AbstractIncomingMessage) -> None:
    """
    Callback for messages from the replay_to_message queue.

    Replicates n8n Flow 1:
    - If abrir_atendimento: toggle_status to 'open', then send message
    - Otherwise: just send the message
    - Supports in_reply_to for message threading
    """
    async with message.process():
        try:
            payload: dict[str, Any] = json.loads(message.body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            logger.error("Could not decode reply message body. Dropping.")
            return

        text: str = payload.get("text", "")
        conversation_id: int = payload.get("conversation_id", 0)
        url_chatwoot: str = payload.get("urlChatwoot", "")
        api_token: str = payload.get("apitoken", "")
        account_id: int = payload.get("account_id", 0)
        message_id: int | None = payload.get("message_id")
        private: bool = payload.get("private", False)
        abrir_atendimento: bool = payload.get("abrir_atendimento", False)

        if not text or not conversation_id or not url_chatwoot or not api_token:
            logger.warning("Reply message missing required fields. Dropping.")
            return

        # INBOX GUARD for reply queue (multi-inbox)
        if account_id:
            valid_inboxes = await supabase_svc.get_org_inbox_ids(account_id)
            if valid_inboxes:
                conv_inbox = await chatwoot_svc.get_conversation_inbox_id(
                    url=url_chatwoot, token=api_token,
                    account_id=account_id, conversation_id=conversation_id,
                )
                if conv_inbox and conv_inbox not in valid_inboxes:
                    logger.warning(
                        "REPLY BLOCKED: conversation %d in inbox %d, org allows %s.",
                        conversation_id, conv_inbox, valid_inboxes,
                    )
                    return

        logger.info(
            "Reply message for conversation %d (abrir=%s, private=%s).",
            conversation_id, abrir_atendimento, private,
        )

        try:
            # If abrir_atendimento: open conversation first
            if abrir_atendimento:
                await chatwoot_svc.toggle_status(
                    url=url_chatwoot, token=api_token,
                    account_id=account_id, conversation_id=conversation_id,
                    status="open",
                )

            # Send the message (with optional in_reply_to)
            await chatwoot_svc.send_message_with_reply(
                url=url_chatwoot, token=api_token,
                account_id=account_id, conversation_id=conversation_id,
                content=text,
                message_id=message_id,
                private=private,
            )

            logger.info("Reply sent to conversation %d.", conversation_id)

        except Exception:
            logger.exception("Failed to process reply for conversation %d.", conversation_id)


# ---------------------------------------------------------------------------
# Campaign message handler
# ---------------------------------------------------------------------------

async def _on_campaign_message(message: AbstractIncomingMessage) -> None:
    """Callback for campaign queue messages. Starts the campaign sender loop."""
    async with message.process():
        try:
            payload: dict[str, Any] = json.loads(message.body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            logger.error("Could not decode campaign message body. Dropping.")
            return

        campaign_id = payload.get("campaign_id")
        action = payload.get("action", "start")

        if not campaign_id:
            logger.warning("Campaign message missing campaign_id. Dropping.")
            return

        if action == "start":
            logger.info("Starting campaign sender for campaign %s.", campaign_id)
            asyncio.create_task(_run_campaign_sender(campaign_id))


async def _run_campaign_sender(campaign_id: str) -> None:
    """
    Loop: check status -> get lead -> send -> update -> sleep(interval) -> repeat.
    Stops when no more pending leads or campaign is paused/completed.
    """
    from datetime import datetime, timezone

    try:
        campaign = await supabase_svc.get_campaign(campaign_id)
        if not campaign:
            logger.error("Campaign %s not found. Aborting sender.", campaign_id)
            return

        org = await supabase_svc.get_organization_by_account_id(0)  # dummy
        # Get org from campaign's organization_id
        client = supabase_svc._get_client()
        org_response = (
            client.table("organizations")
            .select("*")
            .eq("id", campaign["organization_id"])
            .limit(1)
            .execute()
        )
        if not org_response.data:
            logger.error("No org found for campaign %s.", campaign_id)
            return
        org = org_response.data[0]

        # Check if organization is active
        if org.get("is_active") is False:
            logger.warning("Organization %s is blocked. Stopping campaign %s.", org.get("id"), campaign_id)
            await supabase_svc.update_campaign_status(campaign_id, "paused")
            return

        interval = campaign.get("send_interval_seconds", 30)
        template = campaign.get("template_message", "")
        inbox_id = org.get("inbox_id")

        if not inbox_id:
            logger.error("Organization has no inbox_id. Cannot send campaign messages.")
            await supabase_svc.update_campaign_status(campaign_id, "paused")
            return

        while True:
            # Re-check campaign status
            campaign = await supabase_svc.get_campaign(campaign_id)
            if not campaign or campaign["status"] != "active":
                logger.info("Campaign %s is no longer active (status=%s). Stopping sender.",
                            campaign_id, campaign.get("status") if campaign else "deleted")
                break

            # Get next pending lead
            leads = await supabase_svc.get_pending_campaign_leads(campaign_id, limit=1)
            if not leads:
                logger.info("No more pending leads for campaign %s. Marking completed.", campaign_id)
                await supabase_svc.update_campaign_status(
                    campaign_id, "completed",
                    extra={"completed_at": datetime.now(timezone.utc).isoformat()},
                )
                break

            lead = leads[0]
            lead_phone = lead["phone"]
            lead_name = lead.get("name", "Lead")

            # Personalize template
            message = template.replace("{{nome}}", lead_name).replace("{{name}}", lead_name)

            try:
                result = await chatwoot_svc.send_outbound_message(
                    url=org["chatwoot_url"],
                    token=org["chatwoot_token"],
                    account_id=org["chatwoot_account_id"],
                    inbox_id=int(inbox_id),
                    phone=lead_phone,
                    content=message,
                    name=lead_name,
                )
                await supabase_svc.update_campaign_lead_status(
                    lead_id=lead["id"],
                    status="sent",
                    extra={
                        "sent_at": datetime.now(timezone.utc).isoformat(),
                        "conversation_id": result.get("conversation_id"),
                    },
                )
                await supabase_svc.increment_campaign_sent_count(campaign_id)
                logger.info("Campaign lead sent: %s -> %s.", lead_name, lead_phone)

                # Create lead in leads table (non-critical)
                try:
                    await supabase_svc.upsert_lead(
                        org_id=org["id"],
                        name=lead_name,
                        phone=lead_phone,
                        source="campaign",
                    )
                except Exception:
                    logger.warning("Failed to upsert lead for campaign %s phone %s (non-critical).", campaign_id, lead_phone)

            except Exception as exc:
                logger.exception("Failed to send campaign message to %s.", lead_phone)
                await supabase_svc.update_campaign_lead_status(
                    lead_id=lead["id"],
                    status="failed",
                    extra={"error_message": str(exc)[:500]},
                )

            # Sleep between sends
            await asyncio.sleep(interval)

    except Exception:
        logger.exception("Campaign sender crashed for campaign %s.", campaign_id)


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

        # --- Queue 1: incoming_messages (Chatwoot webhook messages) ---
        queue = await channel.declare_queue(
            settings.rabbitmq_queue,
            durable=True,
        )
        await queue.bind(exchange, routing_key=settings.rabbitmq_routing_key)
        await queue.consume(_on_message)
        logger.info(
            "Queue '%s' bound to exchange '%s' with key '%s'.",
            settings.rabbitmq_queue,
            settings.rabbitmq_exchange,
            settings.rabbitmq_routing_key,
        )

        # --- Queue 2: campaign_messages (outbound campaigns) ---
        campaign_queue = await channel.declare_queue(
            "campaign_messages",
            durable=True,
        )
        await campaign_queue.bind(exchange, routing_key="campaign")
        await campaign_queue.consume(_on_campaign_message)
        logger.info("Queue 'campaign_messages' is now consuming campaign events.")

        # --- Queue 3: replay_to_message (Flow 1: reply with text) ---
        reply_queue = await channel.declare_queue(
            settings.rabbitmq_reply_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": "erros",
                "x-dead-letter-routing-key": "erros",
                "x-message-ttl": 300000,
            },
        )
        await reply_queue.consume(_on_reply_message)
        logger.info("Queue '%s' is now consuming reply messages.", settings.rabbitmq_reply_queue)

        # --- Start inactivity cron (Flow 3) ---
        cron_task = asyncio.create_task(run_inactivity_cron(_shutdown_event))
        logger.info("Inactivity cron task started.")

        logger.info("Worker is now consuming messages. Press Ctrl+C to stop.")

        # Wait until shutdown signal
        await _shutdown_event.wait()

        # Cancel cron task
        cron_task.cancel()
        try:
            await cron_task
        except asyncio.CancelledError:
            pass

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
