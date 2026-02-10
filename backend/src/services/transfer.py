"""
SharkPro V2 - Transfer to Human Specialist Service

Replicates the n8n Flow 2 (Transfer Webhook):
1. Parse sessionID → extract account_id, inbox_id, contact_id, conversation_id, phone
2. Lookup empresa in Supabase for org config
3. Open conversation in Chatwoot
4. Assign to team
5. Create contact notes + Kanban card
6. If Kommo CRM enabled: create contact + lead in Kommo
7. Send internal (private) message
8. Update atendimentos in Supabase
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from src.config import Settings, get_settings
from src.services import chatwoot as chatwoot_svc
from src.services import kommo as kommo_svc
from src.services import supabase_client as supabase_svc

logger = logging.getLogger(__name__)


def parse_session_id(session_id: str) -> dict[str, Any]:
    """
    Parse the n8n sessionID format: account_id-inbox_id-contact_id-conversation_id-phone

    Returns dict with parsed fields.
    """
    parts = session_id.split("-")
    return {
        "account_id": int(parts[0]) if len(parts) > 0 else 0,
        "inbox_id": int(parts[1]) if len(parts) > 1 else 0,
        "contact_id": int(parts[2]) if len(parts) > 2 else 0,
        "conversation_id": int(parts[3]) if len(parts) > 3 else 0,
        "phone": parts[4] if len(parts) > 4 else "",
    }


async def execute_transfer(
    nome: str,
    resumo: str,
    company: str,
    team_id: int | None,
    session_id: str,
    url_chatwoot_override: str | None = None,
    apikey_chatwoot_override: str | None = None,
) -> str:
    """
    Execute the full transfer-to-human flow.

    This is the Python equivalent of n8n Flow 2 (Transfer Webhook).

    Parameters
    ----------
    nome:        Contact name.
    resumo:      Summary / internal message.
    company:     Company name (for empresa lookup).
    team_id:     Team to assign (None = skip assignment).
    session_id:  Format: account_id-inbox_id-contact_id-conversation_id-phone.
    url_chatwoot_override: Direct Chatwoot URL (from webhook body).
    apikey_chatwoot_override: Direct API key (from webhook body).

    Returns
    -------
    Success message string.
    """
    settings: Settings = get_settings()
    parsed = parse_session_id(session_id)
    account_id = parsed["account_id"]
    contact_id = parsed["contact_id"]
    conversation_id = parsed["conversation_id"]
    phone = parsed["phone"]

    # --- Step 1: Lookup empresa for org config ---
    empresa = await supabase_svc.get_empresa_by_account_and_company(account_id, company)

    # Determine Chatwoot credentials: empresa > webhook override
    if empresa:
        chatwoot_url = empresa.get("urlChatwoot", url_chatwoot_override or "")
        chatwoot_token = empresa.get("api_access_key", apikey_chatwoot_override or "")
        funnel_id = empresa.get("funnel_id", 0)
        stage_id = str(empresa.get("stage_id", ""))
        kommo_enabled = empresa.get("kommo_crm", False)
    else:
        chatwoot_url = url_chatwoot_override or ""
        chatwoot_token = apikey_chatwoot_override or ""
        funnel_id = 0
        stage_id = ""
        kommo_enabled = False

    if not chatwoot_url or not chatwoot_token:
        logger.error("No Chatwoot credentials for account_id=%d, company='%s'.", account_id, company)
        return "Erro: credenciais Chatwoot nao encontradas."

    # Use override key for toggle_status (same as n8n Abre Atendimento uses Edit Fields Apikey)
    toggle_token = apikey_chatwoot_override or chatwoot_token

    if team_id:
        # --- Path A: Has team_id ---
        # Step 2: Open conversation
        try:
            await chatwoot_svc.toggle_status(
                url=chatwoot_url, token=toggle_token,
                account_id=account_id, conversation_id=conversation_id,
                status="open",
            )
        except Exception:
            logger.exception("Failed to open conversation %d.", conversation_id)

        # Step 3: Assign to team
        try:
            await chatwoot_svc.assign_team(
                url=chatwoot_url, token=chatwoot_token,
                account_id=account_id, conversation_id=conversation_id,
                team_id=team_id,
            )
        except Exception:
            logger.exception("Failed to assign team %d.", team_id)

        # Step 4: Create contact notes
        try:
            await chatwoot_svc.create_contact_note(
                url=chatwoot_url, token=chatwoot_token,
                account_id=account_id, contact_id=contact_id,
                content=resumo,
            )
        except Exception:
            logger.exception("Failed to create contact note.")

        # Step 5: Create Kanban card + note
        if funnel_id:
            kanban_card = await chatwoot_svc.create_kanban_card(
                url=chatwoot_url, token=chatwoot_token,
                account_id=account_id, conversation_id=conversation_id,
                funnel_id=funnel_id, stage_id=stage_id,
                title=f"Prospect {nome}",
            )
            if kanban_card and kanban_card.get("id"):
                await chatwoot_svc.create_kanban_note(
                    url=chatwoot_url, token=chatwoot_token,
                    account_id=account_id, kanban_item_id=kanban_card["id"],
                    text=resumo,
                )

        # Step 6: Send private internal message
        try:
            await chatwoot_svc.send_private_message(
                url=chatwoot_url, token=chatwoot_token,
                account_id=account_id, conversation_id=conversation_id,
                content=resumo,
            )
        except Exception:
            logger.exception("Failed to send internal message.")

        # Step 7: Kommo CRM integration (if enabled)
        if kommo_enabled:
            await _execute_kommo_flow(
                settings=settings,
                nome=nome,
                phone=phone,
                resumo=resumo,
                chatwoot_url=chatwoot_url,
                chatwoot_token=chatwoot_token,
                account_id=account_id,
            )

        # Step 8: Update atendimentos
        await _update_atendimento(session_id, nome)

    else:
        # --- Path B: No team_id ---
        # Open conversation
        try:
            await chatwoot_svc.toggle_status(
                url=chatwoot_url, token=toggle_token,
                account_id=account_id, conversation_id=conversation_id,
                status="open",
            )
        except Exception:
            logger.exception("Failed to open conversation %d.", conversation_id)

        # Send private message
        try:
            await chatwoot_svc.send_private_message(
                url=chatwoot_url, token=chatwoot_token,
                account_id=account_id, conversation_id=conversation_id,
                content=resumo,
            )
        except Exception:
            logger.exception("Failed to send internal message.")

        # Update atendimentos
        await _update_atendimento(session_id, nome)

    logger.info(
        "Transfer completed: conversation=%d, team=%s, kommo=%s.",
        conversation_id, team_id, kommo_enabled,
    )
    return "Transferencia realizada com sucesso!"


async def _execute_kommo_flow(
    settings: Settings,
    nome: str,
    phone: str,
    resumo: str,
    chatwoot_url: str,
    chatwoot_token: str,
    account_id: int,
) -> None:
    """Execute the Kommo CRM sub-flow: create contact, add phone, create lead, add note."""
    if not settings.kommo_subdomain or not settings.kommo_token:
        logger.warning("Kommo settings not configured. Skipping CRM integration.")
        return

    try:
        # Create contact
        contact_id = await kommo_svc.create_contact(
            subdomain=settings.kommo_subdomain,
            token=settings.kommo_token,
            name=nome,
            responsible_user_id=settings.kommo_responsible_user_id,
        )

        # Add phone
        if settings.kommo_phone_field_id and phone:
            await kommo_svc.add_phone_to_contact(
                subdomain=settings.kommo_subdomain,
                token=settings.kommo_token,
                contact_id=contact_id,
                phone=phone,
                phone_field_id=settings.kommo_phone_field_id,
                phone_enum_id=settings.kommo_phone_enum_id,
            )

        # Create lead
        lead_id = await kommo_svc.create_lead(
            subdomain=settings.kommo_subdomain,
            token=settings.kommo_token,
            contact_id=contact_id,
            pipeline_id=settings.kommo_pipeline_id,
            name=nome,
            lead_name_field_id=settings.kommo_lead_name_field_id,
            lead_nome_field_id=settings.kommo_lead_nome_field_id,
            lead_origem_field_id=settings.kommo_lead_origem_field_id,
        )

        # Add note to lead
        await kommo_svc.add_note_to_lead(
            subdomain=settings.kommo_subdomain,
            token=settings.kommo_token,
            lead_id=lead_id,
            text=resumo,
        )

        # Send notifications to configured conversations
        mensagem_notificacao = (
            f"Nome: {nome}\n\nWhatsapp: {phone}\n\nResumo: {resumo}"
        )
        notification_ids = [
            cid.strip()
            for cid in settings.notification_conversation_ids.split(",")
            if cid.strip()
        ]
        for cid in notification_ids:
            try:
                await chatwoot_svc.send_message(
                    url=chatwoot_url, token=chatwoot_token,
                    account_id=account_id,
                    conversation_id=int(cid),
                    content=mensagem_notificacao,
                )
            except Exception:
                logger.warning("Failed to notify conversation %s.", cid)

        logger.info("Kommo CRM flow completed: contact=%d, lead=%d.", contact_id, lead_id)

    except Exception:
        logger.exception("Kommo CRM integration failed (non-blocking).")


async def _update_atendimento(session_id: str, nome: str) -> None:
    """Lookup atendimento by sessionID and update status to 'open'."""
    try:
        atendimento = await supabase_svc.get_atendimento_by_session(session_id)
        if atendimento:
            await supabase_svc.update_atendimento(
                atendimento_id=atendimento["id"],
                updates={
                    "statusAtendimento": "open",
                    "pushname": nome,
                },
            )
    except Exception:
        logger.exception("Failed to update atendimento for session '%s'.", session_id)
