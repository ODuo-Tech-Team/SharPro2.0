"""
SharkPro V2 - Follow-up / Sales Pipeline Router

Provides endpoints for the follow-up dashboard:
  - GET  /api/followup/{account_id}           -- Pipeline leads (paginated)
  - GET  /api/followup/{account_id}/stats      -- Pipeline stats
  - PATCH /api/followup/{account_id}/leads/{lead_id} -- Manual status update
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from src.services import supabase_client as supabase_svc
from src.api.middleware import check_org_active

logger = logging.getLogger(__name__)

followup_router = APIRouter(prefix="/api/followup", tags=["followup"])


@followup_router.get("/{account_id}")
async def get_followup_leads(
    account_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    pipeline_status: str = Query(""),
    search: str = Query(""),
    inbox_id: int | None = None,
) -> dict[str, Any]:
    """Get leads with pipeline data for the follow-up dashboard."""
    org = await supabase_svc.get_organization_by_account_id(account_id, inbox_id=inbox_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    await check_org_active(org)

    result = await supabase_svc.get_followup_leads(
        org_id=org["id"],
        pipeline_status=pipeline_status,
        search=search,
        page=page,
        per_page=per_page,
    )
    return {"status": "ok", **result}


@followup_router.get("/{account_id}/stats")
async def get_followup_stats(account_id: int, inbox_id: int | None = None) -> dict[str, Any]:
    """Get pipeline status counts for the follow-up dashboard."""
    org = await supabase_svc.get_organization_by_account_id(account_id, inbox_id=inbox_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    await check_org_active(org)

    stats = await supabase_svc.get_followup_stats(org["id"])
    return {"status": "ok", "stats": stats}


class PipelineUpdatePayload(BaseModel):
    pipeline_status: str


VALID_PIPELINE_STATUSES = {
    "ia_atendendo",
    "qualificado",
    "transferido",
    "orcamento_enviado",
    "venda_confirmada",
    "perdido",
}


@followup_router.patch("/{account_id}/leads/{lead_id}")
async def update_lead_pipeline_status(
    account_id: int,
    lead_id: str,
    payload: PipelineUpdatePayload,
    inbox_id: int | None = None,
) -> dict[str, Any]:
    """Manually update a lead's pipeline status (e.g., mark as sale)."""
    org = await supabase_svc.get_organization_by_account_id(account_id, inbox_id=inbox_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    await check_org_active(org)

    if payload.pipeline_status not in VALID_PIPELINE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid pipeline_status. Must be one of: {', '.join(sorted(VALID_PIPELINE_STATUSES))}",
        )

    await supabase_svc.update_lead_pipeline(lead_id, {
        "pipeline_status": payload.pipeline_status,
    })

    return {"status": "ok", "lead_id": lead_id, "pipeline_status": payload.pipeline_status}
