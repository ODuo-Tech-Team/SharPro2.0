"""
SharkPro V2 - Kommo CRM Inbound Webhook

Receives "lead added" events from Kommo and sends proactive WhatsApp
messages via the Chatwoot outbound API.  When the customer replies, the
normal Chatwoot → RabbitMQ → AI flow takes over automatically.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from fastapi import APIRouter, Request, Response

from src.config import get_settings
from src.services import supabase_client as supabase_svc
from src.services import chatwoot as chatwoot_svc

logger = logging.getLogger(__name__)

kommo_router = APIRouter(tags=["kommo"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_kommo_form(form_dict: dict[str, str]) -> dict[str, Any]:
    """
    Convert Kommo's flat form-encoded keys into a nested dict.

    Kommo sends data like:
        leads[add][0][id]                            = 123
        leads[add][0][name]                          = João Silva
        leads[add][0][custom_fields][0][id]          = 456
        leads[add][0][custom_fields][0][values][0][value] = +5511999

    This parser handles that pattern.
    """
    result: dict[str, Any] = {}

    for key, value in form_dict.items():
        parts = re.findall(r"([^\[\]]+)", key)
        current: Any = result
        for i, part in enumerate(parts[:-1]):
            next_part = parts[i + 1]
            # If next key looks numeric, ensure current[part] is a list
            if next_part.isdigit():
                current.setdefault(part, [])
                idx = int(next_part)
                while len(current[part]) <= idx:
                    current[part].append({})
                current = current[part]
            elif part.isdigit():
                idx = int(part)
                # current is already the list from the previous step
                while len(current) <= idx:
                    current.append({})
                current = current[idx]
            else:
                current.setdefault(part, {})
                current = current[part]

        last = parts[-1]
        if last.isdigit():
            idx = int(last)
            if isinstance(current, list):
                while len(current) <= idx:
                    current.append({})
                current[idx] = value
        else:
            current[last] = value

    return result


def _extract_phone(lead_data: dict[str, Any], phone_field_id: int) -> Optional[str]:
    """Extract phone number from Kommo lead custom_fields."""
    custom_fields = lead_data.get("custom_fields", [])
    if not isinstance(custom_fields, list):
        return None

    for field in custom_fields:
        field_id = field.get("id")
        # Compare as int (Kommo may send as string)
        try:
            if int(field_id) != phone_field_id:
                continue
        except (ValueError, TypeError):
            continue

        values = field.get("values", [])
        if isinstance(values, list) and values:
            phone = str(values[0].get("value", "")).strip()
            if phone:
                # Normalise: ensure starts with country code
                phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
                if not phone.startswith("+"):
                    phone = f"+{phone}"
                return phone

    return None


async def _get_org_default_inbox(org_id: str) -> Optional[int]:
    """Return the chatwoot_inbox_id of the first connected WhatsApp instance."""
    try:
        instances = await supabase_svc.get_org_instances(org_id)
        for inst in instances:
            inbox_id = inst.get("chatwoot_inbox_id")
            if inbox_id:
                return int(inbox_id)
    except Exception:
        logger.exception("Error fetching default inbox for org=%s.", org_id)
    return None


# ---------------------------------------------------------------------------
# Webhook endpoint
# ---------------------------------------------------------------------------

@kommo_router.post("/webhooks/kommo/{org_id}", status_code=200)
async def kommo_webhook(org_id: str, request: Request) -> Response:
    """
    Receive Kommo webhook when a new lead is created.

    Kommo fires this webhook with the event "Lead added" configured in
    Settings → Integrations → Webhooks.

    Flow:
      1. Parse payload (form-encoded or JSON)
      2. Extract lead name + phone from custom_fields
      3. Lookup org + validate
      4. Deduplicate by phone (upsert_lead)
      5. Send greeting via Chatwoot outbound API
      6. Create conversation record
    """
    # 1. Parse body — Kommo sends form-encoded by default, but may send JSON
    content_type = request.headers.get("content-type", "")
    try:
        if "json" in content_type:
            body: dict[str, Any] = await request.json()
        else:
            form = await request.form()
            body = _parse_kommo_form({k: str(v) for k, v in form.items()})
    except Exception:
        logger.exception("Failed to parse Kommo webhook body.")
        return Response(
            content='{"detail":"parse error"}',
            status_code=200,
            media_type="application/json",
        )

    logger.info("Kommo webhook received for org=%s. Keys: %s", org_id, list(body.keys()))

    # 2. Extract leads from "leads.add" array
    leads_section = body.get("leads", {})
    if isinstance(leads_section, str):
        # Edge case: Kommo sometimes sends nested JSON as string
        import json as _json
        try:
            leads_section = _json.loads(leads_section)
        except (ValueError, TypeError):
            leads_section = {}

    leads_added: list[dict[str, Any]] = leads_section.get("add", [])
    if not leads_added:
        logger.info("Kommo webhook: no leads[add] in payload. Ignoring.")
        return Response(
            content='{"detail":"no leads to process"}',
            status_code=200,
            media_type="application/json",
        )

    # 3. Lookup org
    org = await supabase_svc.get_organization_by_id(org_id)
    if not org:
        logger.warning("Kommo webhook: org %s not found.", org_id)
        return Response(
            content='{"detail":"org not found"}',
            status_code=200,
            media_type="application/json",
        )
    if not org.get("is_active", True):
        logger.warning("Kommo webhook: org %s is inactive.", org_id)
        return Response(
            content='{"detail":"org inactive"}',
            status_code=200,
            media_type="application/json",
        )

    # 4. Config
    s = get_settings()
    phone_field_id = s.kommo_phone_field_id
    if not phone_field_id:
        logger.error("kommo_phone_field_id not configured. Cannot extract phone.")
        return Response(
            content='{"detail":"phone field not configured"}',
            status_code=200,
            media_type="application/json",
        )

    chatwoot_url = org.get("chatwoot_url", "")
    chatwoot_token = org.get("chatwoot_token", "")
    account_id = org.get("chatwoot_account_id")

    if not chatwoot_url or not chatwoot_token or not account_id:
        logger.error("Org %s missing Chatwoot credentials.", org_id)
        return Response(
            content='{"detail":"chatwoot not configured"}',
            status_code=200,
            media_type="application/json",
        )

    # 5. Process each lead
    processed = 0
    for lead_data in leads_added:
        lead_name = lead_data.get("name", "Lead Kommo")
        phone = _extract_phone(lead_data, phone_field_id)

        if not phone:
            logger.warning(
                "Kommo lead id=%s has no phone (field_id=%d). Skipping.",
                lead_data.get("id"), phone_field_id,
            )
            continue

        # 5a. Upsert lead in SharkPro DB
        try:
            lead = await supabase_svc.upsert_lead(
                org_id=org_id,
                name=lead_name,
                phone=phone,
                source="kommo",
            )
        except Exception:
            logger.exception("Failed to upsert Kommo lead phone=%s.", phone)
            continue

        # 5b. Skip outbound if lead already existed (avoid duplicate messages)
        if lead and lead.get("status") != "new":
            logger.info("Kommo lead %s already exists. Skipping outbound.", phone)
            continue

        # 5c. Get inbox for outbound message
        inbox_id = await _get_org_default_inbox(org_id)
        if not inbox_id:
            logger.error("No WhatsApp inbox found for org %s. Cannot send greeting.", org_id)
            continue

        # 5d. Build greeting message
        welcome_template = (
            org.get("kommo_welcome_message")
            or "Olá! Vi que você demonstrou interesse. Como posso te ajudar?"
        )
        greeting = welcome_template.replace("{{nome}}", lead_name)

        # 5e. Send via Chatwoot outbound API (creates contact + conversation + sends msg)
        try:
            result = await chatwoot_svc.send_outbound_message(
                url=chatwoot_url,
                token=chatwoot_token,
                account_id=int(account_id),
                inbox_id=inbox_id,
                phone=phone,
                content=greeting,
                name=lead_name,
            )
        except Exception:
            logger.exception("Failed to send outbound message for Kommo lead %s.", phone)
            continue

        # 5f. Update lead with conversation_id + create conversation record
        conversation_id = result.get("conversation_id") if result else None
        contact_id = result.get("contact_id") if result else None

        if conversation_id and lead and lead.get("id"):
            try:
                await supabase_svc.update_lead_pipeline(lead["id"], {
                    "pipeline_status": "ia_atendendo",
                    "conversation_id": conversation_id,
                })
            except Exception:
                logger.warning("Failed to update lead pipeline for Kommo lead %s.", phone)

            try:
                await supabase_svc.upsert_conversation(
                    org_id=org_id,
                    conversation_id=conversation_id,
                    contact_id=contact_id,
                )
            except Exception:
                logger.warning("Failed to upsert conversation for Kommo lead %s.", phone)

        processed += 1
        logger.info(
            "Kommo inbound processed: lead=%s, phone=%s, conversation=%s.",
            lead_name, phone, conversation_id,
        )

    return Response(
        content=f'{{"detail":"processed {processed} leads"}}',
        status_code=200,
        media_type="application/json",
    )
