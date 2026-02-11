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



# ---------------------------------------------------------------------------
# Auth / Admin helpers
# ---------------------------------------------------------------------------

async def validate_user_token(jwt: str) -> Optional[dict[str, Any]]:
    """Validate a JWT via Supabase GoTrue and return the user dict."""
    try:
        client = _get_client()
        response = client.auth.get_user(jwt)
        if response and response.user:
            return {
                "id": response.user.id,
                "email": response.user.email,
                "role": response.user.role,
            }
        return None
    except Exception:
        logger.warning("Token validation failed.")
        return None


async def get_profile_by_user_id(user_id: str) -> Optional[dict[str, Any]]:
    """Get a profile row by user ID."""
    try:
        client = _get_client()
        response = (
            client.table("profiles")
            .select("*")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception:
        logger.exception("Error getting profile for user=%s.", user_id)
        return None


async def get_all_organizations_with_details() -> list[dict[str, Any]]:
    """List all organizations with plan name, owner email, and instance status."""
    try:
        client = _get_client()
        response = (
            client.table("organizations")
            .select("*, plans(id, name)")
            .order("created_at", desc=True)
            .execute()
        )
        orgs = response.data or []

        for org in orgs:
            # Get owner (first admin profile for this org)
            owner_res = (
                client.table("profiles")
                .select("id, email, full_name")
                .eq("organization_id", org["id"])
                .eq("role", "admin")
                .limit(1)
                .execute()
            )
            org["owner"] = owner_res.data[0] if owner_res.data else None

            # Get instance count and status
            inst_res = (
                client.table("whatsapp_instances")
                .select("id, status")
                .eq("organization_id", org["id"])
                .execute()
            )
            instances = inst_res.data or []
            org["instance_count"] = len(instances)
            org["whatsapp_connected"] = any(i.get("status") == "connected" for i in instances)

        return orgs
    except Exception:
        logger.exception("Error listing organizations with details.")
        return []


async def get_organization_full(org_id: str) -> Optional[dict[str, Any]]:
    """Get full organization data for admin edit modal."""
    try:
        client = _get_client()
        response = (
            client.table("organizations")
            .select("*, plans(id, name)")
            .eq("id", org_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None

        org = response.data[0]

        # Get owner
        owner_res = (
            client.table("profiles")
            .select("id, email, full_name")
            .eq("organization_id", org_id)
            .eq("role", "admin")
            .limit(1)
            .execute()
        )
        org["owner"] = owner_res.data[0] if owner_res.data else None

        return org
    except Exception:
        logger.exception("Error getting full org data for org=%s.", org_id)
        return None


ALLOWED_ORG_UPDATE_FIELDS = {
    "plan_id", "system_prompt", "openai_api_key",
    "chatwoot_account_id", "chatwoot_url", "chatwoot_token", "inbox_id",
}


async def update_organization(org_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Update organization fields (whitelist-enforced)."""
    try:
        client = _get_client()
        safe_updates = {k: v for k, v in updates.items() if k in ALLOWED_ORG_UPDATE_FIELDS}
        if not safe_updates:
            return {}
        response = (
            client.table("organizations")
            .update(safe_updates)
            .eq("id", org_id)
            .execute()
        )
        result = response.data[0] if response.data else {}
        logger.info("Organization %s updated: %s", org_id, list(safe_updates.keys()))
        return result
    except Exception:
        logger.exception("Error updating organization %s.", org_id)
        raise


async def set_organization_active(org_id: str, is_active: bool) -> dict[str, Any]:
    """Toggle organization active/blocked status."""
    try:
        client = _get_client()
        response = (
            client.table("organizations")
            .update({"is_active": is_active})
            .eq("id", org_id)
            .execute()
        )
        result = response.data[0] if response.data else {}
        logger.info("Organization %s is_active set to %s.", org_id, is_active)
        return result
    except Exception:
        logger.exception("Error toggling org %s active status.", org_id)
        raise


async def get_org_owner(org_id: str) -> Optional[dict[str, Any]]:
    """Get the admin user (owner) for an organization."""
    try:
        client = _get_client()
        response = (
            client.table("profiles")
            .select("id, email, full_name")
            .eq("organization_id", org_id)
            .eq("role", "admin")
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception:
        logger.exception("Error getting owner for org=%s.", org_id)
        return None


async def admin_reset_user_password(user_id: str, new_password: str) -> None:
    """Reset a user's password via Supabase Admin API."""
    try:
        client = _get_client()
        client.auth.admin.update_user_by_id(
            user_id,
            {"password": new_password},
        )
        logger.info("Password reset for user %s.", user_id)
    except Exception:
        logger.exception("Error resetting password for user %s.", user_id)
        raise


async def admin_generate_magic_link(user_id: str) -> Optional[str]:
    """Generate a magic link for impersonating a user."""
    try:
        client = _get_client()
        # Get user email first
        profile = await get_profile_by_user_id(user_id)
        if not profile:
            return None

        email = profile.get("email", "")
        if not email:
            return None

        response = client.auth.admin.generate_link(
            {
                "type": "magiclink",
                "email": email,
            }
        )
        if response and hasattr(response, "properties") and response.properties:
            return response.properties.action_link
        return None
    except Exception:
        logger.exception("Error generating magic link for user %s.", user_id)
        return None


async def get_all_plans() -> list[dict[str, Any]]:
    """List all available plans."""
    try:
        client = _get_client()
        response = (
            client.table("plans")
            .select("*")
            .order("price", desc=False)
            .execute()
        )
        return response.data or []
    except Exception:
        logger.exception("Error listing plans.")
        return []


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


async def upsert_lead(
    org_id: str,
    name: str,
    phone: str,
    contact_id: Optional[int] = None,
    source: str = "organic",
) -> Optional[dict[str, Any]]:
    """
    Insert a lead if it doesn't already exist (keyed on org_id + phone).

    Returns the lead row or None on error.
    """
    try:
        client = _get_client()
        # Check if lead already exists
        existing = (
            client.table("leads")
            .select("id")
            .eq("organization_id", org_id)
            .eq("phone", phone)
            .limit(1)
            .execute()
        )
        if existing.data:
            logger.debug("Lead already exists for phone=%s org=%s. Skipping.", phone, org_id)
            return existing.data[0]

        payload: dict[str, Any] = {
            "organization_id": org_id,
            "name": name,
            "phone": phone,
            "source": source,
            "status": "new",
        }
        if contact_id is not None:
            payload["contact_id"] = contact_id

        response = client.table("leads").insert(payload).execute()
        lead = response.data[0] if response.data else {}
        logger.info("Lead upserted: %s phone=%s (org=%s, source=%s).", name, phone, org_id, source)
        return lead
    except Exception:
        logger.exception("Error upserting lead phone=%s for org=%s.", phone, org_id)
        return None


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


async def upsert_conversation(
    org_id: str,
    conversation_id: int,
    contact_id: Optional[int] = None,
    ai_status: str = "active",
    status: str = "bot",
) -> dict[str, Any]:
    """
    Upsert a conversation row keyed on conversation_id.
    Creates if not exists, updates if it does.
    """
    try:
        client = _get_client()
        payload: dict[str, Any] = {
            "organization_id": org_id,
            "conversation_id": conversation_id,
            "ai_status": ai_status,
            "status": status,
        }
        if contact_id is not None:
            payload["contact_id"] = contact_id

        response = (
            client.table("conversations")
            .upsert(payload, on_conflict="conversation_id")
            .execute()
        )
        result = response.data[0] if response.data else {}
        logger.info("Conversation %d upserted (ai_status=%s, status=%s).", conversation_id, ai_status, status)
        return result
    except Exception:
        logger.exception("Error upserting conversation %d.", conversation_id)
        raise


async def get_conversation_ai_status(conversation_id: int) -> Optional[str]:
    """Get the ai_status for a conversation. Returns None if not found."""
    try:
        client = _get_client()
        response = (
            client.table("conversations")
            .select("ai_status")
            .eq("conversation_id", conversation_id)
            .limit(1)
            .execute()
        )
        if response.data:
            return response.data[0].get("ai_status")
        return None
    except Exception:
        logger.exception("Error getting ai_status for conversation %d.", conversation_id)
        return None


async def set_conversation_ai_status(
    conversation_id: int,
    ai_status: str,
    status: Optional[str] = None,
) -> None:
    """Update ai_status (and optionally status) for a conversation."""
    try:
        client = _get_client()
        updates: dict[str, Any] = {"ai_status": ai_status}
        if status is not None:
            updates["status"] = status
        client.table("conversations").update(updates).eq("conversation_id", conversation_id).execute()
        logger.info("Conversation %d ai_status set to '%s'.", conversation_id, ai_status)
    except Exception:
        logger.exception("Error setting ai_status for conversation %d.", conversation_id)


async def insert_sale_idempotent(
    org_id: str,
    amount: float,
    source: str = "ai",
    conversation_id: Optional[int] = None,
    confirmed_by: str = "label",
) -> Optional[dict[str, Any]]:
    """
    Upsert a sale with idempotency on (organization_id, conversation_id).
    If conversation_id is None, falls back to a regular insert.
    """
    try:
        client = _get_client()
        payload: dict[str, Any] = {
            "organization_id": org_id,
            "amount": amount,
            "source": source,
            "confirmed_by": confirmed_by,
        }
        if conversation_id is not None:
            payload["conversation_id"] = conversation_id
            response = (
                client.table("sales_metrics")
                .upsert(payload, on_conflict="organization_id,conversation_id")
                .execute()
            )
        else:
            response = client.table("sales_metrics").insert(payload).execute()

        sale = response.data[0] if response.data else {}
        logger.info(
            "Sale recorded (idempotent): %.2f from '%s' conv=%s (org=%s).",
            amount, source, conversation_id, org_id,
        )
        return sale
    except Exception:
        logger.exception("Error inserting idempotent sale for org=%s conv=%s.", org_id, conversation_id)
        return None


async def get_dashboard_stats(org_id: str) -> dict[str, Any]:
    """
    Aggregate dashboard statistics for an organization:
    - leads_today, leads_interacting, total_sales, conversations_active, conversations_paused
    """
    from datetime import datetime, timezone
    try:
        client = _get_client()
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

        # Run queries
        leads_today_res = (
            client.table("leads")
            .select("id", count="exact")
            .eq("organization_id", org_id)
            .gte("created_at", today_start)
            .execute()
        )
        leads_interacting_res = (
            client.table("leads")
            .select("id", count="exact")
            .eq("organization_id", org_id)
            .in_("status", ["new", "qualified"])
            .execute()
        )
        sales_res = (
            client.table("sales_metrics")
            .select("amount")
            .eq("organization_id", org_id)
            .execute()
        )
        conv_active_res = (
            client.table("conversations")
            .select("id", count="exact")
            .eq("organization_id", org_id)
            .eq("ai_status", "active")
            .execute()
        )
        conv_paused_res = (
            client.table("conversations")
            .select("id", count="exact")
            .eq("organization_id", org_id)
            .eq("ai_status", "paused")
            .execute()
        )

        total_sales = sum(s.get("amount", 0) for s in (sales_res.data or []))

        return {
            "leads_today": leads_today_res.count or 0,
            "leads_interacting": leads_interacting_res.count or 0,
            "total_sales": total_sales,
            "total_sales_count": len(sales_res.data or []),
            "conversations_active": conv_active_res.count or 0,
            "conversations_paused": conv_paused_res.count or 0,
        }
    except Exception:
        logger.exception("Error getting dashboard stats for org=%s.", org_id)
        return {
            "leads_today": 0,
            "leads_interacting": 0,
            "total_sales": 0,
            "total_sales_count": 0,
            "conversations_active": 0,
            "conversations_paused": 0,
        }


# ---------------------------------------------------------------------------
# Campaign helpers
# ---------------------------------------------------------------------------

async def create_campaign(
    org_id: str,
    name: str,
    template_message: str,
    send_interval_seconds: int = 30,
) -> dict[str, Any]:
    """Create a new campaign in draft status."""
    try:
        client = _get_client()
        payload = {
            "organization_id": org_id,
            "name": name,
            "template_message": template_message,
            "send_interval_seconds": send_interval_seconds,
            "status": "draft",
        }
        response = client.table("campaigns").insert(payload).execute()
        campaign = response.data[0] if response.data else {}
        logger.info("Campaign '%s' created for org=%s.", name, org_id)
        return campaign
    except Exception:
        logger.exception("Error creating campaign for org=%s.", org_id)
        raise


async def get_campaign(campaign_id: str) -> Optional[dict[str, Any]]:
    """Get a campaign by ID."""
    try:
        client = _get_client()
        response = (
            client.table("campaigns")
            .select("*")
            .eq("id", campaign_id)
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception:
        logger.exception("Error getting campaign %s.", campaign_id)
        return None


async def update_campaign_status(
    campaign_id: str,
    status: str,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """Update campaign status and optional extra fields."""
    try:
        client = _get_client()
        updates: dict[str, Any] = {"status": status}
        if extra:
            updates.update(extra)
        client.table("campaigns").update(updates).eq("id", campaign_id).execute()
        logger.info("Campaign %s status set to '%s'.", campaign_id, status)
    except Exception:
        logger.exception("Error updating campaign %s.", campaign_id)


async def insert_campaign_leads_batch(
    campaign_id: str,
    org_id: str,
    leads: list[dict[str, str]],
) -> int:
    """
    Batch insert campaign leads. Each lead dict should have 'name' and 'phone'.
    Returns the number of leads inserted.
    """
    try:
        client = _get_client()
        rows = [
            {
                "campaign_id": campaign_id,
                "organization_id": org_id,
                "name": lead.get("name", ""),
                "phone": lead.get("phone", ""),
                "status": "pending",
            }
            for lead in leads
        ]
        if not rows:
            return 0
        response = client.table("campaign_leads").insert(rows).execute()
        count = len(response.data) if response.data else 0
        # Update total_leads on campaign
        client.table("campaigns").update({"total_leads": count}).eq("id", campaign_id).execute()
        logger.info("Inserted %d leads for campaign %s.", count, campaign_id)
        return count
    except Exception:
        logger.exception("Error inserting campaign leads for campaign %s.", campaign_id)
        raise


async def get_pending_campaign_leads(
    campaign_id: str,
    limit: int = 1,
) -> list[dict[str, Any]]:
    """Get pending leads for a campaign, ordered by creation."""
    try:
        client = _get_client()
        response = (
            client.table("campaign_leads")
            .select("*")
            .eq("campaign_id", campaign_id)
            .eq("status", "pending")
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return response.data or []
    except Exception:
        logger.exception("Error getting pending leads for campaign %s.", campaign_id)
        return []


async def update_campaign_lead_status(
    lead_id: str,
    status: str,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """Update a campaign lead's status."""
    try:
        client = _get_client()
        updates: dict[str, Any] = {"status": status}
        if extra:
            updates.update(extra)
        client.table("campaign_leads").update(updates).eq("id", lead_id).execute()
    except Exception:
        logger.exception("Error updating campaign lead %s.", lead_id)


async def increment_campaign_sent_count(campaign_id: str) -> None:
    """Increment the sent_count for a campaign."""
    try:
        client = _get_client()
        campaign = await get_campaign(campaign_id)
        if campaign:
            new_count = (campaign.get("sent_count") or 0) + 1
            client.table("campaigns").update({"sent_count": new_count}).eq("id", campaign_id).execute()
    except Exception:
        logger.exception("Error incrementing sent_count for campaign %s.", campaign_id)


async def increment_campaign_replied_count(campaign_id: str) -> None:
    """Increment the replied_count for a campaign."""
    try:
        client = _get_client()
        campaign = await get_campaign(campaign_id)
        if campaign:
            new_count = (campaign.get("replied_count") or 0) + 1
            client.table("campaigns").update({"replied_count": new_count}).eq("id", campaign_id).execute()
    except Exception:
        logger.exception("Error incrementing replied_count for campaign %s.", campaign_id)


async def check_phone_is_campaign_lead(phone: str) -> Optional[dict[str, Any]]:
    """Check if a phone number belongs to an active campaign lead."""
    try:
        client = _get_client()
        response = (
            client.table("campaign_leads")
            .select("*, campaigns!inner(id, status)")
            .eq("phone", phone)
            .eq("status", "sent")
            .limit(1)
            .execute()
        )
        if response.data:
            return response.data[0]
        return None
    except Exception:
        logger.exception("Error checking phone '%s' as campaign lead.", phone)
        return None


async def get_campaigns_by_org(org_id: str) -> list[dict[str, Any]]:
    """Get all campaigns for an organization."""
    try:
        client = _get_client()
        response = (
            client.table("campaigns")
            .select("*")
            .eq("organization_id", org_id)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data or []
    except Exception:
        logger.exception("Error getting campaigns for org=%s.", org_id)
        return []


async def get_campaign_leads(campaign_id: str) -> list[dict[str, Any]]:
    """Get all leads for a campaign."""
    try:
        client = _get_client()
        response = (
            client.table("campaign_leads")
            .select("*")
            .eq("campaign_id", campaign_id)
            .order("created_at", desc=False)
            .execute()
        )
        return response.data or []
    except Exception:
        logger.exception("Error getting leads for campaign %s.", campaign_id)
        return []


async def count_active_campaigns(org_id: str) -> int:
    """Count active campaigns for an organization."""
    try:
        client = _get_client()
        response = (
            client.table("campaigns")
            .select("id", count="exact")
            .eq("organization_id", org_id)
            .in_("status", ["active", "draft"])
            .execute()
        )
        return response.count or 0
    except Exception:
        logger.exception("Error counting campaigns for org=%s.", org_id)
        return 0


async def count_org_leads(org_id: str) -> int:
    """Count total leads for an organization."""
    try:
        client = _get_client()
        response = (
            client.table("leads")
            .select("id", count="exact")
            .eq("organization_id", org_id)
            .execute()
        )
        return response.count or 0
    except Exception:
        logger.exception("Error counting leads for org=%s.", org_id)
        return 0


async def count_org_users(org_id: str) -> int:
    """Count users (profiles) for an organization."""
    try:
        client = _get_client()
        response = (
            client.table("profiles")
            .select("id", count="exact")
            .eq("organization_id", org_id)
            .execute()
        )
        return response.count or 0
    except Exception:
        logger.exception("Error counting users for org=%s.", org_id)
        return 0


# ---------------------------------------------------------------------------
# Plan enforcement helpers
# ---------------------------------------------------------------------------

async def get_organization_with_plan(org_id: str) -> Optional[dict[str, Any]]:
    """Get organization joined with its plan details."""
    try:
        client = _get_client()
        response = (
            client.table("organizations")
            .select("*, plans(*)")
            .eq("id", org_id)
            .limit(1)
            .execute()
        )
        if response.data:
            return response.data[0]
        return None
    except Exception:
        logger.exception("Error getting org with plan for org=%s.", org_id)
        return None


async def check_plan_limit(org_id: str, resource: str) -> dict[str, Any]:
    """
    Check if an organization has exceeded a plan limit.

    resource: 'users', 'campaigns', 'leads'
    Returns: {allowed: bool, current: int, limit: int, plan_name: str}
    """
    org = await get_organization_with_plan(org_id)
    if not org or not org.get("plans"):
        return {"allowed": True, "current": 0, "limit": -1, "plan_name": "unknown"}

    plan = org["plans"]
    plan_name = plan.get("name", "unknown")

    if resource == "users":
        current = await count_org_users(org_id)
        limit_val = plan.get("max_users", -1)
    elif resource == "campaigns":
        current = await count_active_campaigns(org_id)
        limit_val = plan.get("max_campaigns", -1)
    elif resource == "leads":
        current = await count_org_leads(org_id)
        limit_val = plan.get("max_leads", -1)
    elif resource == "connections":
        current = await count_org_instances(org_id)
        limit_val = plan.get("max_connections", -1)
    else:
        return {"allowed": True, "current": 0, "limit": -1, "plan_name": plan_name}

    # -1 means unlimited
    if limit_val == -1:
        return {"allowed": True, "current": current, "limit": -1, "plan_name": plan_name}

    allowed = current < limit_val
    return {"allowed": allowed, "current": current, "limit": limit_val, "plan_name": plan_name}


async def insert_feedback(
    org_id: str,
    user_id: str,
    feedback_type: str,
    title: str,
    description: str = "",
) -> dict[str, Any]:
    """Insert a feedback entry."""
    try:
        client = _get_client()
        payload = {
            "organization_id": org_id,
            "user_id": user_id,
            "type": feedback_type,
            "title": title,
            "description": description,
            "status": "open",
        }
        response = client.table("feedback").insert(payload).execute()
        result = response.data[0] if response.data else {}
        logger.info("Feedback created: '%s' (org=%s).", title, org_id)
        return result
    except Exception:
        logger.exception("Error inserting feedback for org=%s.", org_id)
        raise


# ---------------------------------------------------------------------------
# Atendimentos (legacy)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# WhatsApp Instance helpers
# ---------------------------------------------------------------------------

async def count_org_instances(org_id: str) -> int:
    """Count WhatsApp instances for an organization."""
    try:
        client = _get_client()
        response = (
            client.table("whatsapp_instances")
            .select("id", count="exact")
            .eq("organization_id", org_id)
            .execute()
        )
        return response.count or 0
    except Exception:
        logger.exception("Error counting instances for org=%s.", org_id)
        return 0


async def get_org_instances(org_id: str) -> list[dict[str, Any]]:
    """List all WhatsApp instances for an organization."""
    try:
        client = _get_client()
        response = (
            client.table("whatsapp_instances")
            .select("*")
            .eq("organization_id", org_id)
            .order("created_at", desc=False)
            .execute()
        )
        return response.data or []
    except Exception:
        logger.exception("Error listing instances for org=%s.", org_id)
        return []


async def get_instance(instance_id: str) -> Optional[dict[str, Any]]:
    """Get a single WhatsApp instance by ID."""
    try:
        client = _get_client()
        response = (
            client.table("whatsapp_instances")
            .select("*")
            .eq("id", instance_id)
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception:
        logger.exception("Error getting instance %s.", instance_id)
        return None


async def instance_name_exists(instance_name: str) -> bool:
    """Check if an instance_name already exists."""
    try:
        client = _get_client()
        response = (
            client.table("whatsapp_instances")
            .select("id", count="exact")
            .eq("instance_name", instance_name)
            .execute()
        )
        return (response.count or 0) > 0
    except Exception:
        logger.exception("Error checking instance name '%s'.", instance_name)
        return True  # assume exists on error to prevent duplicates


async def create_instance_record(
    org_id: str,
    instance_name: str,
    display_name: str,
    uazapi_token: str = "",
    chatwoot_inbox_id: int | None = None,
    chatwoot_inbox_token: str = "",
    status: str = "pending",
) -> dict[str, Any]:
    """Insert a new whatsapp_instances row."""
    try:
        client = _get_client()
        payload: dict[str, Any] = {
            "organization_id": org_id,
            "instance_name": instance_name,
            "display_name": display_name,
            "uazapi_token": uazapi_token,
            "status": status,
        }
        if chatwoot_inbox_id is not None:
            payload["chatwoot_inbox_id"] = chatwoot_inbox_id
        if chatwoot_inbox_token:
            payload["chatwoot_inbox_token"] = chatwoot_inbox_token
        response = client.table("whatsapp_instances").insert(payload).execute()
        result = response.data[0] if response.data else {}
        logger.info("Instance '%s' record created for org=%s.", instance_name, org_id)
        return result
    except Exception:
        logger.exception("Error creating instance record '%s'.", instance_name)
        raise


async def update_instance(instance_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Update fields on a whatsapp_instances row."""
    try:
        client = _get_client()
        response = (
            client.table("whatsapp_instances")
            .update(updates)
            .eq("id", instance_id)
            .execute()
        )
        result = response.data[0] if response.data else {}
        logger.info("Instance %s updated: %s", instance_id, list(updates.keys()))
        return result
    except Exception:
        logger.exception("Error updating instance %s.", instance_id)
        raise


async def delete_instance_record(instance_id: str) -> None:
    """Delete a whatsapp_instances row."""
    try:
        client = _get_client()
        client.table("whatsapp_instances").delete().eq("id", instance_id).execute()
        logger.info("Instance %s deleted.", instance_id)
    except Exception:
        logger.exception("Error deleting instance %s.", instance_id)
        raise
