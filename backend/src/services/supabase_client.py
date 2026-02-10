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
            logger.debug("Found organization '%s' for account %d.", org.get("name"), account_id)
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
