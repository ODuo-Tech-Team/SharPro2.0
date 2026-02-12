"""
SharkPro V2 - WhatsApp Instance Manager API Router

Provides endpoints for managing WhatsApp instances:
  - GET  /api/instances/org/{account_id}           -- List instances
  - POST /api/instances/                            -- Create instance (Uazapi only)
  - POST /api/instances/{id}/connect-chatwoot       -- Configure Chatwoot integration
  - GET  /api/instances/{id}/qrcode                 -- Get QR code
  - GET  /api/instances/{id}/status                 -- Check connection status
  - POST /api/instances/{id}/disconnect             -- Disconnect WhatsApp (keep instance)
  - DELETE /api/instances/{id}                       -- Delete instance completely
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from fastapi import APIRouter, HTTPException

from src.config import get_settings
from src.services import supabase_client as supabase_svc
from src.services import uazapi as uazapi_svc
from src.api.middleware import check_plan_limit, check_org_active
from src.api.schemas import InstanceCreate, InstanceRegister

logger = logging.getLogger(__name__)

instance_router = APIRouter(prefix="/api/instances", tags=["instances"])


def _slugify(name: str) -> str:
    """Convert org name to URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug or "instance"


async def _generate_instance_name(org_name: str) -> str:
    """Generate a unique instance name like 'empresa-1', 'empresa-2', etc."""
    base = _slugify(org_name)
    counter = 1
    while True:
        candidate = f"{base}-{counter}"
        if not await supabase_svc.instance_name_exists(candidate):
            return candidate
        counter += 1
        if counter > 100:
            raise ValueError(f"Could not generate unique name for base '{base}'")


@instance_router.get("/org/{account_id}")
async def list_instances(account_id: int) -> dict[str, Any]:
    """List all WhatsApp instances for an organization."""
    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    instances = await supabase_svc.get_org_instances(org["id"])
    return {"status": "ok", "instances": instances}


@instance_router.post("/")
async def create_instance(payload: InstanceCreate) -> dict[str, Any]:
    """
    Create a new WhatsApp instance:
    1. Check plan limit
    2. Generate unique name
    3. Create instance in Uazapi
    4. Persist to DB
    (Chatwoot integration is configured separately via connect-chatwoot)
    """
    org = await supabase_svc.get_organization_by_account_id(payload.account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    await check_org_active(org)
    await check_plan_limit(org["id"], "connections")

    instance_name = await _generate_instance_name(org["name"])
    display_name = payload.display_name or f"WhatsApp {instance_name}"

    # Create in Uazapi
    try:
        uazapi_result = await uazapi_svc.create_instance(instance_name)
        uazapi_token = uazapi_result.get("token", "")
    except Exception as exc:
        logger.exception("Failed to create Uazapi instance '%s'.", instance_name)
        raise HTTPException(status_code=502, detail=f"Uazapi error: {exc}")

    # Persist to DB
    instance = await supabase_svc.create_instance_record(
        org_id=org["id"],
        instance_name=instance_name,
        display_name=display_name,
        uazapi_token=uazapi_token,
        status="connecting",
    )

    return {
        "status": "ok",
        "instance": instance,
    }


@instance_router.post("/register")
async def register_instance(payload: InstanceRegister) -> dict[str, Any]:
    """
    Register an existing Uazapi instance by its token.

    Validates the token against Uazapi (GET /instance/status),
    then saves it to the DB without creating anything new.
    """
    org = await supabase_svc.get_organization_by_account_id(payload.account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    await check_org_active(org)
    await check_plan_limit(org["id"], "connections")

    token = payload.uazapi_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="uazapi_token is required")

    # Validate the token by checking status on Uazapi
    try:
        status_data = await uazapi_svc.get_instance_status(token)
    except Exception as exc:
        logger.exception("Failed to validate Uazapi token.")
        raise HTTPException(status_code=400, detail=f"Token invalido ou Uazapi indisponivel: {exc}")

    # Extract instance name from Uazapi response
    inst_info = status_data.get("instance", {})
    instance_name = inst_info.get("instanceName", "") or inst_info.get("name", "") or f"uazapi-{token[:8]}"
    display_name = payload.display_name or instance_name

    # Check connection status
    raw_status = (inst_info.get("status", status_data.get("status", ""))).lower()
    is_connected = raw_status in ("open", "connected") or status_data.get("connected", False)
    db_status = "connected" if is_connected else "disconnected"
    phone = inst_info.get("phoneNumber", "") or inst_info.get("phone", "") or status_data.get("phone", "")

    # Persist to DB
    instance = await supabase_svc.create_instance_record(
        org_id=org["id"],
        instance_name=instance_name,
        display_name=display_name,
        uazapi_token=token,
        status=db_status,
    )

    if phone:
        await supabase_svc.update_instance(instance["id"], {"phone_number": phone})
        instance["phone_number"] = phone

    logger.info("Registered existing Uazapi instance '%s' (status=%s) for org %s.", instance_name, db_status, org["id"])

    return {
        "status": "ok",
        "instance": instance,
    }


@instance_router.post("/{instance_id}/connect-chatwoot")
async def connect_chatwoot(instance_id: str, account_id: int = 0, inbox_id: int = 0) -> dict[str, Any]:
    """
    Configure Uazapi ↔ Chatwoot integration via n8n webhook.

    Delegates the actual PUT /chatwoot/config to n8n (which already works).
    We just pass: token (from instance), inbox_id, and account_id.
    """
    logger.info("connect-chatwoot called: instance=%s, account_id=%d, inbox_id=%d", instance_id, account_id, inbox_id)

    if not inbox_id:
        raise HTTPException(status_code=400, detail="inbox_id is required")
    if not account_id:
        raise HTTPException(status_code=400, detail="account_id is required")

    instance = await supabase_svc.get_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    uazapi_token = instance.get("uazapi_token")
    if not uazapi_token:
        raise HTTPException(status_code=400, detail="Instance has no Uazapi token")

    settings = get_settings()
    if not settings.n8n_chatwoot_webhook_url:
        raise HTTPException(status_code=500, detail="N8N_CHATWOOT_WEBHOOK_URL not configured")

    # Call n8n webhook — it handles the PUT /chatwoot/config on Uazapi
    import httpx
    payload = {
        "token": uazapi_token,
        "inbox_id": inbox_id,
        "account_id": account_id,
    }
    logger.info("Calling n8n webhook: %s with inbox_id=%d, account_id=%d", settings.n8n_chatwoot_webhook_url, inbox_id, account_id)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(settings.n8n_chatwoot_webhook_url, json=payload)
            resp.raise_for_status()
            result = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {"raw": resp.text}
            logger.info("n8n webhook OK for instance %s: %s", instance_id, result)
    except Exception as exc:
        logger.exception("n8n webhook failed for instance %s.", instance_id)
        raise HTTPException(status_code=502, detail=f"n8n webhook failed: {exc}")

    # Save inbox_id to the organization for the inbox guard
    org = await supabase_svc.get_organization_by_account_id(account_id)
    if org and (not org.get("inbox_id") or int(org.get("inbox_id", 0)) != inbox_id):
        try:
            await supabase_svc.update_organization(org["id"], {"inbox_id": inbox_id})
            logger.info("Updated org %s inbox_id to %d.", org["id"], inbox_id)
        except Exception:
            logger.warning("Failed to update org inbox_id (non-critical).")

    return {"status": "ok", "detail": "Chatwoot connected via n8n", "inbox_id": inbox_id}


@instance_router.get("/{instance_id}/qrcode")
async def get_qr_code(instance_id: str) -> dict[str, Any]:
    """Get QR code for an existing instance (with retry for race conditions)."""

    instance = await supabase_svc.get_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    if not instance.get("uazapi_token"):
        raise HTTPException(status_code=400, detail="Instance has no Uazapi token")

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            qr_data = await uazapi_svc.connect_instance(instance["uazapi_token"])
            inst_data = qr_data.get("instance", {})
            qr_code = inst_data.get("qrcode", "") or qr_data.get("qrcode", "")
            pairing_code = inst_data.get("paircode", "") or qr_data.get("pairingCode", "")
            if qr_code:
                return {
                    "status": "ok",
                    "qrcode": qr_code,
                    "pairingCode": pairing_code,
                }
            logger.info("QR code empty on attempt %d for instance %s. Retrying...", attempt + 1, instance_id)
        except Exception as exc:
            last_error = exc
            logger.warning("QR code attempt %d failed for instance %s: %s", attempt + 1, instance_id, exc)

        if attempt < 2:
            await asyncio.sleep(2)

    if last_error:
        raise HTTPException(status_code=502, detail=f"Uazapi error: {last_error}")
    return {"status": "ok", "qrcode": "", "pairingCode": ""}


@instance_router.get("/{instance_id}/status")
async def get_instance_status(instance_id: str) -> dict[str, Any]:
    """Check connection status of an instance and update DB."""
    instance = await supabase_svc.get_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    if not instance.get("uazapi_token"):
        return {"status": "ok", "connection": "no_token", "instance": instance}

    try:
        status_data = await uazapi_svc.get_instance_status(instance["uazapi_token"])
        inst_info = status_data.get("instance", {})
        raw_status = (inst_info.get("status", status_data.get("status", ""))).lower()
        is_connected = raw_status in ("open", "connected") or status_data.get("connected", False)
        new_status = "connected" if is_connected else "disconnected"
        phone = inst_info.get("phoneNumber", "") or inst_info.get("phone", "") or status_data.get("phone", "")

        updates: dict[str, Any] = {"status": new_status}
        if phone and phone != instance.get("phone_number"):
            updates["phone_number"] = phone

        if new_status != instance.get("status") or phone:
            await supabase_svc.update_instance(instance_id, updates)

        return {
            "status": "ok",
            "connection": new_status,
            "phone": phone,
            "instance": {**instance, **updates},
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Uazapi error: {exc}")


@instance_router.post("/{instance_id}/disconnect")
async def disconnect_instance(instance_id: str) -> dict[str, Any]:
    """Disconnect WhatsApp from instance (logout) without deleting it."""
    instance = await supabase_svc.get_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    if not instance.get("uazapi_token"):
        raise HTTPException(status_code=400, detail="Instance has no Uazapi token")

    try:
        await uazapi_svc.disconnect_instance(instance["uazapi_token"])
    except Exception as exc:
        logger.exception("Failed to disconnect instance %s.", instance_id)
        raise HTTPException(status_code=502, detail=f"Uazapi error: {exc}")

    await supabase_svc.update_instance(instance_id, {
        "status": "disconnected",
        "phone_number": None,
    })

    return {"status": "ok", "detail": "WhatsApp disconnected"}


@instance_router.delete("/{instance_id}")
async def delete_instance(instance_id: str) -> dict[str, Any]:
    """Delete an instance from Uazapi and DB."""
    instance = await supabase_svc.get_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    if instance.get("uazapi_token"):
        try:
            await uazapi_svc.delete_instance(instance["uazapi_token"])
        except Exception:
            logger.warning("Failed to delete Uazapi instance '%s'. Continuing with DB cleanup.", instance["instance_name"])

    await supabase_svc.delete_instance_record(instance_id)

    return {"status": "ok", "detail": "Instance deleted"}
