"""
SharkPro V2 - Campaign API Router

Provides endpoints for managing outbound campaigns:
  - POST /api/campaigns/              -- Create campaign
  - POST /api/campaigns/{id}/upload-csv -- Upload leads CSV
  - POST /api/campaigns/{id}/start    -- Start campaign
  - POST /api/campaigns/{id}/pause    -- Pause campaign
  - GET  /api/campaigns/{id}/stats    -- Campaign stats
  - GET  /api/campaigns/org/{account_id} -- List campaigns for org
  - GET  /api/campaigns/{id}/leads    -- List campaign leads
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File, UploadFile, HTTPException

from src.services import supabase_client as supabase_svc
from src.services import rabbitmq as rmq
from src.config import get_settings
from src.api.schemas import CampaignCreate
from src.api.middleware import check_plan_limit, check_org_active

logger = logging.getLogger(__name__)
settings = get_settings()

campaign_router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@campaign_router.post("/")
async def create_campaign(payload: CampaignCreate) -> dict[str, Any]:
    """Create a new campaign in draft status."""
    org = await supabase_svc.get_organization_by_account_id(payload.account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    await check_org_active(org)

    # Check plan limit for campaigns
    await check_plan_limit(org["id"], "campaigns")

    campaign = await supabase_svc.create_campaign(
        org_id=org["id"],
        name=payload.name,
        template_message=payload.template_message,
        send_interval_seconds=payload.send_interval_seconds,
    )
    return {"status": "ok", "campaign": campaign}


@campaign_router.post("/{campaign_id}/upload-csv")
async def upload_csv(campaign_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    """Parse a CSV file and insert leads for the campaign."""
    campaign = await supabase_svc.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign["status"] != "draft":
        raise HTTPException(status_code=400, detail="Can only upload leads to draft campaigns")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    leads: list[dict[str, str]] = []
    for row in reader:
        name = row.get("name") or row.get("nome") or row.get("Name") or ""
        phone = row.get("phone") or row.get("telefone") or row.get("Phone") or row.get("whatsapp") or ""
        if phone:
            # Normalize phone: remove spaces, dashes
            phone = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
            if not phone.startswith("+"):
                phone = f"+{phone}"
            leads.append({"name": name.strip(), "phone": phone})

    if not leads:
        raise HTTPException(status_code=400, detail="No valid leads found in CSV")

    count = await supabase_svc.insert_campaign_leads_batch(
        campaign_id=campaign_id,
        org_id=campaign["organization_id"],
        leads=leads,
    )

    return {"status": "ok", "leads_imported": count}


@campaign_router.post("/{campaign_id}/start")
async def start_campaign(campaign_id: str) -> dict[str, Any]:
    """Activate a campaign and publish to RabbitMQ for the worker."""
    campaign = await supabase_svc.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign["status"] not in ("draft", "paused"):
        raise HTTPException(status_code=400, detail=f"Cannot start campaign in '{campaign['status']}' status")

    await supabase_svc.update_campaign_status(
        campaign_id=campaign_id,
        status="active",
        extra={"started_at": datetime.now(timezone.utc).isoformat()},
    )

    # Publish to campaign_messages queue
    try:
        await rmq.publish_message(
            routing_key="campaign",
            body={"campaign_id": campaign_id, "action": "start"},
        )
        logger.info("Campaign %s published to RabbitMQ.", campaign_id)
    except Exception:
        logger.exception("Failed to publish campaign %s to RabbitMQ.", campaign_id)

    return {"status": "ok", "campaign_id": campaign_id, "campaign_status": "active"}


@campaign_router.post("/{campaign_id}/pause")
async def pause_campaign(campaign_id: str) -> dict[str, Any]:
    """Pause an active campaign."""
    campaign = await supabase_svc.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    await supabase_svc.update_campaign_status(campaign_id=campaign_id, status="paused")
    return {"status": "ok", "campaign_id": campaign_id, "campaign_status": "paused"}


@campaign_router.get("/{campaign_id}/stats")
async def campaign_stats(campaign_id: str) -> dict[str, Any]:
    """Get progress stats for a campaign."""
    campaign = await supabase_svc.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return {
        "status": "ok",
        "campaign": {
            "id": campaign["id"],
            "name": campaign["name"],
            "status": campaign["status"],
            "total_leads": campaign["total_leads"],
            "sent_count": campaign["sent_count"],
            "replied_count": campaign["replied_count"],
            "started_at": campaign.get("started_at"),
            "completed_at": campaign.get("completed_at"),
        },
    }


@campaign_router.get("/org/{account_id}")
async def list_campaigns(account_id: int) -> dict[str, Any]:
    """List all campaigns for an organization."""
    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    campaigns = await supabase_svc.get_campaigns_by_org(org["id"])
    return {"status": "ok", "campaigns": campaigns}


@campaign_router.get("/{campaign_id}/leads")
async def list_campaign_leads(campaign_id: str) -> dict[str, Any]:
    """List all leads for a campaign."""
    leads = await supabase_svc.get_campaign_leads(campaign_id)
    return {"status": "ok", "leads": leads}
