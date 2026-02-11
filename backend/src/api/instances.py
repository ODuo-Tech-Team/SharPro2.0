"""
SharkPro V2 - WhatsApp Instance Manager API Router

Provides endpoints for managing WhatsApp instances:
  - GET  /api/instances/org/{account_id}           -- List instances
  - POST /api/instances/                            -- Create instance (full flow)
  - GET  /api/instances/{instance_id}/qrcode        -- Get QR code
  - GET  /api/instances/{instance_id}/status         -- Check connection status
  - DELETE /api/instances/{instance_id}              -- Delete instance
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
    """
    Generate a unique instance name like 'shark-pro-1', 'shark-pro-2', etc.

    Checks the DB to avoid collisions.
    """
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
    Full instance creation flow:
    1. Check plan limit (max_connections)
    2. Generate unique instance name
    3. Create instance in Uazapi
    4. Create inbox in Chatwoot
    5. Persist to DB
    6. Configure webhook
    7. Return instance with QR code
    """
    org = await supabase_svc.get_organization_by_account_id(payload.account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    await check_org_active(org)

    # Step 1: Plan limit check
    await check_plan_limit(org["id"], "connections")

    # Step 2: Generate unique name
    instance_name = await _generate_instance_name(org["name"])
    display_name = payload.display_name or f"WhatsApp {instance_name}"

    # Step 3: Create in Uazapi
    try:
        uazapi_result = await uazapi_svc.create_instance(instance_name)
        uazapi_token = uazapi_result.get("token", "")
    except Exception as exc:
        logger.exception("Failed to create Uazapi instance '%s'.", instance_name)
        raise HTTPException(status_code=502, detail=f"Uazapi error: {exc}")

    # Step 4: Create Chatwoot inbox
    chatwoot_inbox_id = None
    chatwoot_inbox_token = ""
    if org.get("chatwoot_url") and org.get("chatwoot_token") and org.get("chatwoot_account_id"):
        try:
            inbox_result = await chatwoot_svc.create_inbox(
                url=org["chatwoot_url"],
                token=org["chatwoot_token"],
                account_id=org["chatwoot_account_id"],
                name=display_name,
                channel_type="api",
            )
            chatwoot_inbox_id = inbox_result.get("id")
            chatwoot_inbox_token = (
                inbox_result.get("channel", {}).get("hmac_token", "")
                or inbox_result.get("inbox_identifier", "")
                or ""
            )
        except Exception:
            logger.warning("Failed to create Chatwoot inbox for '%s'. Continuing without.", instance_name)

    # Step 5: Persist to DB
    instance = await supabase_svc.create_instance_record(
        org_id=org["id"],
        instance_name=instance_name,
        display_name=display_name,
        uazapi_token=uazapi_token,
        chatwoot_inbox_id=chatwoot_inbox_id,
        chatwoot_inbox_token=chatwoot_inbox_token,
        status="connecting",
    )

    # Step 6: Configure webhook on Uazapi
    if uazapi_token:
        try:
            settings = get_settings()
            webhook_url = f"{settings.api_base_url}/webhooks/uazapi"
            await uazapi_svc.set_webhook(uazapi_token, webhook_url)
        except Exception:
            logger.warning("Failed to set webhook for '%s'. Can be configured later.", instance_name)

    # Step 7: Connect instance (generates QR code)
    qr_code = ""
    pairing_code = ""
    if uazapi_token:
        try:
            qr_data = await uazapi_svc.connect_instance(uazapi_token)
            inst_data = qr_data.get("instance", {})
            qr_code = inst_data.get("qrcode", "") or qr_data.get("qrcode", "")
            pairing_code = inst_data.get("paircode", "") or qr_data.get("pairingCode", "")
        except Exception:
            logger.warning("Failed to start connection for '%s'.", instance_name)

    return {
        "status": "ok",
        "instance": instance,
        "qrcode": qr_code,
        "pairingCode": pairing_code,
    }


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
            # QR not ready yet, wait and retry
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
        # Uazapi nests data inside "instance" key
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
