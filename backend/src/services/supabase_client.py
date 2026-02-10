"""
SharkPro V2 - Supabase Client Wrapper

Provides async-friendly helpers around the Supabase Python SDK.
All database access goes through the service-role key so RLS is
bypassed on the backend (the backend is a trusted service).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from supabase import Client, create_client

from src.config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def _get_client() -> Client:
    """Return a singleton Supabase client."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
        logger.info("Supabase client initialised for %s", settings.supabase_url)
    return _client


async def get_organization_by_account_id(account_id: int) -> Optional[dict[str, Any]]:
    """
    Look up an organization row by its ``chatwoot_account_id``.

    Returns ``None`` if no match is found.
    """
    try:
        client = _get_client()
        response = (
            client.table("organizations")
            .select("*")
            .eq("chatwoot_account_id", account_id)
            .limit(1)
            .execute()
        )
        if response.data:
            org = response.data[0]
            logger.info("Found organization '%s' for account %d.", org.get("name"), account_id)
            return org
        logger.warning("No organization found for chatwoot_account_id=%d.", account_id)
        return None
    except Exception:
        logger.exception("Error querying organization for account_id=%d.", account_id)
        raise


async def insert_lead(
    org_id: str,
    name: str,
    phone: str,
    contact_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Insert a new lead into the ``leads`` table.

    Parameters
    ----------
    org_id:     UUID of the organization.
    name:       Lead's display name.
    phone:      Lead's phone number.
    contact_id: Chatwoot contact ID (optional).
    """
    try:
        client = _get_client()
        payload: dict[str, Any] = {
            "organization_id": org_id,
            "name": name,
            "phone": phone,
            "status": "new",
        }
        if contact_id is not None:
            payload["contact_id"] = contact_id

        response = client.table("leads").insert(payload).execute()
        lead = response.data[0] if response.data else {}
        logger.info("Lead inserted: %s (org=%s).", name, org_id)
        return lead
    except Exception:
        logger.exception("Error inserting lead '%s' for org=%s.", name, org_id)
        raise


async def insert_sale(
    org_id: str,
    amount: float,
    source: str = "ai",
) -> dict[str, Any]:
    """
    Record a sale in the ``sales_metrics`` table.

    Parameters
    ----------
    org_id: UUID of the organization.
    amount: Monetary value of the sale.
    source: ``"ai"`` or ``"human"``.
    """
    try:
        client = _get_client()
        payload = {
            "organization_id": org_id,
            "amount": amount,
            "source": source,
        }
        response = client.table("sales_metrics").insert(payload).execute()
        sale = response.data[0] if response.data else {}
        logger.info("Sale recorded: %.2f from '%s' (org=%s).", amount, source, org_id)
        return sale
    except Exception:
        logger.exception("Error inserting sale for org=%s.", org_id)
        raise


async def update_lead_conversion(
    lead_id: str,
    conversion_value: float,
) -> dict[str, Any]:
    """
    Update the conversion value on an existing lead row.
    """
    try:
        client = _get_client()
        response = (
            client.table("leads")
            .update({"conversion_value": conversion_value, "status": "converted"})
            .eq("id", lead_id)
            .execute()
        )
        result = response.data[0] if response.data else {}
        logger.info("Lead %s conversion updated to %.2f.", lead_id, conversion_value)
        return result
    except Exception:
        logger.exception("Error updating lead %s conversion.", lead_id)
        raise


# ---------------------------------------------------------------------------
# Empresas (legacy table from n8n)
# ---------------------------------------------------------------------------

async def get_empresa_by_account_and_company(
    account_id: int,
    company: str,
) -> Optional[dict[str, Any]]:
    """Look up an empresa by Chatwoot account_id and company name."""
    try:
        client = _get_client()
        response = (
            client.table("empresas")
            .select("*")
            .eq("acountId", account_id)
            .eq("empresa", company)
            .limit(1)
            .execute()
        )
        if response.data:
            return response.data[0]
        logger.warning("No empresa found for account_id=%d, company='%s'.", account_id, company)
        return None
    except Exception:
        logger.exception("Error querying empresa for account_id=%d.", account_id)
        raise


async def get_empresa_by_inbox_and_account(
    inbox_id: int,
    account_id: int,
) -> Optional[dict[str, Any]]:
    """Look up an empresa by inbox_id and account_id."""
    try:
        client = _get_client()
        response = (
            client.table("empresas")
            .select("*")
            .eq("inbox", inbox_id)
            .eq("acountId", account_id)
            .limit(1)
            .execute()
        )
        if response.data:
            return response.data[0]
        logger.warning("No empresa found for inbox=%d, account_id=%d.", inbox_id, account_id)
        return None
    except Exception:
        logger.exception("Error querying empresa by inbox=%d.", inbox_id)
        raise


# ---------------------------------------------------------------------------
# Atendimentos (legacy table from n8n)
# ---------------------------------------------------------------------------

async def get_atendimento_by_session(session_id: str) -> Optional[dict[str, Any]]:
    """Look up an atendimento by sessionid."""
    try:
        client = _get_client()
        response = (
            client.table("atendimentos")
            .select("*")
            .eq("sessionid", session_id)
            .limit(1)
            .execute()
        )
        if response.data:
            return response.data[0]
        return None
    except Exception:
        logger.exception("Error querying atendimento for session='%s'.", session_id)
        raise


async def update_atendimento(
    atendimento_id: int,
    updates: dict[str, Any],
) -> dict[str, Any]:
    """Update fields on an atendimento row."""
    try:
        client = _get_client()
        response = (
            client.table("atendimentos")
            .update(updates)
            .eq("id", atendimento_id)
            .execute()
        )
        result = response.data[0] if response.data else {}
        logger.info("Atendimento %d updated: %s", atendimento_id, list(updates.keys()))
        return result
    except Exception:
        logger.exception("Error updating atendimento %d.", atendimento_id)
        raise


async def get_stale_atendimentos(threshold_iso: str) -> list[dict[str, Any]]:
    """
    Get all atendimentos with status 'pending' and lastedupdated <= threshold.

    Parameters
    ----------
    threshold_iso: ISO 8601 timestamp string (e.g. '2025-01-01T12:00:00')
    """
    try:
        client = _get_client()
        response = (
            client.table("atendimentos")
            .select("*")
            .eq("statusAtendimento", "pending")
            .lte("lastedupdated", threshold_iso)
            .execute()
        )
        results = response.data or []
        logger.info("Found %d stale atendimentos (threshold=%s).", len(results), threshold_iso)
        return results
    except Exception:
        logger.exception("Error querying stale atendimentos.")
        raise
