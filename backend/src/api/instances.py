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

import logging
import re
from typing import Any

from fastapi import APIRouter, HTTPException

from src.config import get_settings
from src.services import supabase_client as supabase_svc
from src.services import chatwoot as chatwoot_svc
from src.services import uazapi as uazapi_svc
from src.api.middleware import check_plan_limit, check_org_active
from src.api.schemas import InstanceCreate

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


@instance_router.post("/{instance_id}/connect-chatwoot")
async def connect_chatwoot(instance_id: str, account_id: int = 0) -> dict[str, Any]:
    """
    Configure Uazapi ↔ Chatwoot integration.
    Replicates exactly the n8n node: PUT /chatwoot/config on Uazapi.
    """
    logger.info("connect-chatwoot called for instance=%s, account_id=%d", instance_id, account_id)

    instance = await supabase_svc.get_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    uazapi_token = instance.get("uazapi_token")
    if not uazapi_token:
        raise HTTPException(status_code=400, detail="Instance has no Uazapi token")

    # Get org by account_id (the reliable way)
    org = await supabase_svc.get_organization_by_account_id(account_id) if account_id else None
    if not org:
        raise HTTPException(status_code=404, detail=f"Organization not found for account_id={account_id}")

    chatwoot_url = org.get("chatwoot_url", "")
    chatwoot_token = org.get("chatwoot_token", "")
    chatwoot_account_id = org.get("chatwoot_account_id")
    inbox_id = org.get("inbox_id")

    logger.info(
        "Org found: chatwoot_url=%s, account_id=%s, inbox_id=%s, has_token=%s",
        chatwoot_url, chatwoot_account_id, inbox_id, bool(chatwoot_token),
    )

    if not all([chatwoot_url, chatwoot_token, chatwoot_account_id, inbox_id]):
        missing = []
        if not chatwoot_url: missing.append("chatwoot_url")
        if not chatwoot_token: missing.append("chatwoot_token")
        if not chatwoot_account_id: missing.append("chatwoot_account_id")
        if not inbox_id: missing.append("inbox_id")
        raise HTTPException(status_code=400, detail=f"Organization missing: {', '.join(missing)}")

    settings = get_settings()

    # CRITICAL: Configure Uazapi built-in Chatwoot integration
    # This is the exact same as the n8n node: PUT /chatwoot/config
    try:
        result = await uazapi_svc.configure_chatwoot(
            instance_token=uazapi_token,
            chatwoot_url=chatwoot_url,
            chatwoot_token=chatwoot_token,
            account_id=chatwoot_account_id,
            inbox_id=inbox_id,
        )
        logger.info("Uazapi Chatwoot config OK for instance %s: %s", instance_id, result)
    except Exception as exc:
        logger.exception("Failed to configure Uazapi Chatwoot.")
        raise HTTPException(status_code=502, detail=f"Uazapi config failed: {exc}")

    # NON-CRITICAL: Try to update Chatwoot inbox webhook URL
    chatwoot_webhook_url = f"{settings.uazapi_base_url}/chatwoot/webhook/{uazapi_token}"
    try:
        await chatwoot_svc.update_inbox(
            url=chatwoot_url,
            token=chatwoot_token,
            account_id=chatwoot_account_id,
            inbox_id=inbox_id,
            webhook_url=chatwoot_webhook_url,
        )
        logger.info("Chatwoot inbox %d webhook updated to %s", inbox_id, chatwoot_webhook_url)
    except Exception:
        logger.warning("Could not update Chatwoot inbox webhook (non-critical). URL: %s", chatwoot_webhook_url)

    # Save inbox_id on the instance
    try:
        await supabase_svc.update_instance(instance_id, {"chatwoot_inbox_id": inbox_id})
    except Exception:
        logger.warning("Could not save inbox_id on instance (non-critical).")

    return {"status": "ok", "detail": "Chatwoot connected successfully"}


@instance_router.get("/{instance_id}/qrcode")
async def get_qr_code(instance_id: str) -> dict[str, Any]:
    """Get QR code for an existing instance (with retry for race conditions)."""
    import asyncio

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
