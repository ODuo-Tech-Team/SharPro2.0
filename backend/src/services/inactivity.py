"""
SharkPro V2 - Inactivity Handler Service

Replicates the n8n Flow 3 (Inactivity Cron):
1. Query atendimentos with status='pending' older than 30 minutes
2. For each: lookup empresa config, open conversation, assign team,
   send internal message, update DB
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from src.config import Settings, get_settings
from src.services import chatwoot as chatwoot_svc
from src.services import supabase_client as supabase_svc

logger = logging.getLogger(__name__)

INACTIVITY_MESSAGE = "Esse atendimento foi aberto por motivo de inatividade da parte do cliente."


async def process_stale_atendimentos(
    threshold_minutes: int | None = None,
    default_team_id: int | None = None,
) -> int:
    """
    Process all stale pending atendimentos.

    This is the Python equivalent of n8n Flow 3 (Inactivity Cron).

    Parameters
    ----------
    threshold_minutes: Override for inactivity threshold (default from settings).
    default_team_id:   Override for default team assignment (default from settings).

    Returns
    -------
    Number of atendimentos processed.
    """
    settings: Settings = get_settings()
    threshold = threshold_minutes or settings.inactivity_threshold_minutes
    team_id = default_team_id or settings.inactivity_default_team_id

    # Calculate cutoff time
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=threshold)
    cutoff_iso = cutoff.isoformat()

    logger.info("Checking for stale atendimentos older than %d minutes.", threshold)

    atendimentos = await supabase_svc.get_stale_atendimentos(cutoff_iso)

    if not atendimentos:
        logger.debug("No stale atendimentos found.")
        return 0

    processed = 0
    for atendimento in atendimentos:
        try:
            await _process_single_atendimento(atendimento, team_id)
            processed += 1
        except Exception:
            logger.exception(
                "Failed to process stale atendimento id=%s.",
                atendimento.get("id"),
            )

    logger.info("Processed %d/%d stale atendimentos.", processed, len(atendimentos))
    return processed


async def _process_single_atendimento(
    atendimento: dict[str, Any],
    team_id: int,
) -> None:
    """Process a single stale atendimento."""
    session_id: str = atendimento.get("sessionid", "")
    atendimento_id: int = atendimento["id"]
    inbox_id: int = atendimento.get("inboxId", 0)
    conversation_id = atendimento.get("conversationid") or atendimento.get("conversation_id", 0)

    # Parse account_id from sessionID if not directly available
    parts = session_id.split("-") if session_id else []
    account_id = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else atendimento.get("acountId", 0)

    if not account_id or not inbox_id:
        logger.warning("Atendimento %d missing account_id or inbox_id. Skipping.", atendimento_id)
        return

    # Lookup empresa config for Chatwoot credentials
    empresa = await supabase_svc.get_empresa_by_inbox_and_account(inbox_id, account_id)
    if not empresa:
        logger.warning("No empresa found for atendimento %d. Skipping.", atendimento_id)
        return

    chatwoot_url = empresa.get("urlChatwoot", "")
    chatwoot_token = empresa.get("api_access_key", "")

    if not chatwoot_url or not chatwoot_token:
        logger.warning("No Chatwoot credentials for empresa. Skipping atendimento %d.", atendimento_id)
        return

    # Ensure we have a valid conversation_id
    if not conversation_id:
        if len(parts) > 3 and parts[3].isdigit():
            conversation_id = int(parts[3])
        else:
            logger.warning("Cannot determine conversation_id for atendimento %d. Skipping.", atendimento_id)
            return

    # Step 1: Open conversation
    try:
        await chatwoot_svc.toggle_status(
            url=chatwoot_url, token=chatwoot_token,
            account_id=account_id, conversation_id=int(conversation_id),
            status="open",
        )
    except Exception:
        logger.exception("Failed to open conversation %s for atendimento %d.", conversation_id, atendimento_id)

    # Step 2: Assign to team
    try:
        await chatwoot_svc.assign_team(
            url=chatwoot_url, token=chatwoot_token,
            account_id=account_id, conversation_id=int(conversation_id),
            team_id=team_id,
        )
    except Exception:
        logger.exception("Failed to assign team for atendimento %d.", atendimento_id)

    # Step 3: Send internal message
    try:
        await chatwoot_svc.send_private_message(
            url=chatwoot_url, token=chatwoot_token,
            account_id=account_id, conversation_id=int(conversation_id),
            content=INACTIVITY_MESSAGE,
        )
    except Exception:
        logger.exception("Failed to send inactivity message for atendimento %d.", atendimento_id)

    # Step 4: Update atendimento status
    await supabase_svc.update_atendimento(
        atendimento_id=atendimento_id,
        updates={"statusAtendimento": "open"},
    )

    logger.info("Stale atendimento %d processed (conversation=%s).", atendimento_id, conversation_id)


async def run_inactivity_cron(shutdown_event: asyncio.Event) -> None:
    """
    Background cron task that checks for stale atendimentos periodically.

    Parameters
    ----------
    shutdown_event: Set this event to stop the cron loop.
    """
    settings: Settings = get_settings()
    interval = settings.inactivity_check_interval_minutes * 60

    logger.info(
        "Inactivity cron started: checking every %d minutes, threshold=%d minutes.",
        settings.inactivity_check_interval_minutes,
        settings.inactivity_threshold_minutes,
    )

    while not shutdown_event.is_set():
        try:
            await process_stale_atendimentos()
        except Exception:
            logger.exception("Inactivity cron iteration failed.")

        # Wait for the interval or until shutdown
        try:
            await asyncio.wait_for(shutdown_event.wait(), timeout=interval)
            break  # shutdown_event was set
        except asyncio.TimeoutError:
            pass  # Normal: timeout means we should run again
