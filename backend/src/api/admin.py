"""
SharkPro V2 - Super Admin API Router

All routes require super admin authentication.
Provides management endpoints for organizations, plans, and impersonation.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.auth import check_superadmin
from src.api.schemas import AdminInstanceRegister
from src.services import supabase_client as supabase_svc
from src.services import uazapi as uazapi_svc

logger = logging.getLogger(__name__)

admin_router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(check_superadmin)],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class OrganizationUpdate(BaseModel):
    plan_id: Optional[str] = None
    system_prompt: Optional[str] = None
    openai_api_key: Optional[str] = None
    chatwoot_account_id: Optional[int] = None
    chatwoot_url: Optional[str] = None
    chatwoot_token: Optional[str] = None
    inbox_id: Optional[int] = None


class StatusToggle(BaseModel):
    is_active: bool


class PasswordReset(BaseModel):
    new_password: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@admin_router.get("/organizations")
async def list_organizations() -> dict[str, Any]:
    """List all organizations with owner, plan, and instance details."""
    orgs = await supabase_svc.get_all_organizations_with_details()
    return {"status": "ok", "organizations": orgs}


@admin_router.get("/organizations/{org_id}")
async def get_organization(org_id: str) -> dict[str, Any]:
    """Get full details of a single organization for the edit modal."""
    org = await supabase_svc.get_organization_full(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"status": "ok", "organization": org}


@admin_router.patch("/organizations/{org_id}")
async def update_organization(org_id: str, payload: OrganizationUpdate) -> dict[str, Any]:
    """Update allowed fields on an organization."""
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await supabase_svc.update_organization(org_id, updates)
    return {"status": "ok", "organization": result}


@admin_router.patch("/organizations/{org_id}/status")
async def toggle_organization_status(org_id: str, payload: StatusToggle) -> dict[str, Any]:
    """Toggle organization active/blocked status."""
    result = await supabase_svc.set_organization_active(org_id, payload.is_active)
    action = "activated" if payload.is_active else "blocked"
    logger.info("Organization %s %s by admin.", org_id, action)
    return {"status": "ok", "is_active": payload.is_active, "organization": result}


@admin_router.post("/organizations/{org_id}/reset-password")
async def reset_owner_password(org_id: str, payload: PasswordReset) -> dict[str, Any]:
    """Reset the password for the organization's admin user."""
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    owner = await supabase_svc.get_org_owner(org_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Organization owner not found")

    await supabase_svc.admin_reset_user_password(owner["id"], payload.new_password)
    logger.info("Password reset for user %s (org %s) by admin.", owner["id"], org_id)
    return {"status": "ok", "detail": "Password reset successfully"}


@admin_router.post("/impersonate/{org_id}")
async def impersonate_organization(org_id: str) -> dict[str, Any]:
    """Generate a magic link to impersonate the organization's admin user."""
    owner = await supabase_svc.get_org_owner(org_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Organization owner not found")

    magic_link = await supabase_svc.admin_generate_magic_link(owner["id"])
    if not magic_link:
        raise HTTPException(status_code=500, detail="Failed to generate magic link")

    return {"status": "ok", "magic_link": magic_link, "owner_email": owner.get("email", "")}


@admin_router.get("/plans")
async def list_plans() -> dict[str, Any]:
    """List all available plans for the dropdown."""
    plans = await supabase_svc.get_all_plans()
    return {"status": "ok", "plans": plans}


# ---------------------------------------------------------------------------
# Instance Management (Admin-only)
# ---------------------------------------------------------------------------

@admin_router.get("/organizations/{org_id}/instances")
async def admin_list_instances(org_id: str) -> dict[str, Any]:
    """List all WhatsApp instances for a specific organization."""
    org = await supabase_svc.get_organization_by_id(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    instances = await supabase_svc.get_org_instances(org_id)
    return {"status": "ok", "instances": instances}


@admin_router.post("/organizations/{org_id}/instances/register")
async def admin_register_instance(
    org_id: str,
    payload: AdminInstanceRegister,
) -> dict[str, Any]:
    """
    Register an existing Uazapi instance to a client organization.

    Validates the token against Uazapi, extracts instance metadata,
    and saves the record to the database linked to the given org.
    """
    # Validate organization exists
    org = await supabase_svc.get_organization_by_id(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    token = payload.uazapi_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="uazapi_token is required")

    # Validate the token by checking status on Uazapi
    try:
        status_data = await uazapi_svc.get_instance_status(token)
    except Exception as exc:
        logger.exception("Admin: failed to validate Uazapi token for org %s.", org_id)
        raise HTTPException(
            status_code=400,
            detail=f"Token invalido ou Uazapi indisponivel: {exc}",
        )

    # Extract instance name from Uazapi response
    inst_info = status_data.get("instance", {})
    instance_name = (
        inst_info.get("instanceName", "")
        or inst_info.get("name", "")
        or f"uazapi-{token[:8]}"
    )
    display_name = payload.display_name or instance_name

    # Check connection status
    raw_status = (inst_info.get("status", status_data.get("status", ""))).lower()
    is_connected = raw_status in ("open", "connected") or status_data.get("connected", False)
    db_status = "connected" if is_connected else "disconnected"
    phone = (
        inst_info.get("phoneNumber", "")
        or inst_info.get("phone", "")
        or status_data.get("phone", "")
    )

    # Persist to DB with the target organization
    instance = await supabase_svc.create_instance_record(
        org_id=org_id,
        instance_name=instance_name,
        display_name=display_name,
        uazapi_token=token,
        status=db_status,
    )

    if phone:
        await supabase_svc.update_instance(instance["id"], {"phone_number": phone})
        instance["phone_number"] = phone

    logger.info(
        "Admin registered Uazapi instance '%s' (status=%s) for org %s.",
        instance_name,
        db_status,
        org_id,
    )

    return {"status": "ok", "instance": instance}


@admin_router.delete("/organizations/{org_id}/instances/{instance_id}")
async def admin_delete_instance(org_id: str, instance_id: str) -> dict[str, Any]:
    """
    Delete an instance from Uazapi and from the database.

    Verifies the instance belongs to the specified organization before
    proceeding with deletion.
    """
    # Verify instance exists
    instance = await supabase_svc.get_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    # Verify instance belongs to the specified organization
    if instance.get("organization_id") != org_id:
        raise HTTPException(
            status_code=400,
            detail="Instance does not belong to this organization",
        )

    # Delete from Uazapi (best-effort; continue even if it fails)
    if instance.get("uazapi_token"):
        try:
            await uazapi_svc.delete_instance(instance["uazapi_token"])
        except Exception:
            logger.warning(
                "Admin: failed to delete Uazapi instance '%s'. Continuing with DB cleanup.",
                instance.get("instance_name"),
            )

    # Delete from DB
    await supabase_svc.delete_instance_record(instance_id)

    logger.info(
        "Admin deleted instance '%s' (id=%s) from org %s.",
        instance.get("instance_name"),
        instance_id,
        org_id,
    )

    return {"status": "ok", "detail": "Instance deleted"}
