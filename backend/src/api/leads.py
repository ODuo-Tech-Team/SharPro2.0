"""
SharkPro V2 - Leads API Routes

Provides endpoints for managing leads:
  - GET  /api/leads/{account_id}         -- Paginated leads list
  - GET  /api/leads/{account_id}/export  -- CSV export
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from src.services import supabase_client as supabase_svc

logger = logging.getLogger(__name__)

leads_router = APIRouter(prefix="/api/leads", tags=["leads"])


@leads_router.get("/{account_id}")
async def get_leads(
    account_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str = Query(""),
    status: str = Query(""),
    origin: str = Query(""),
    inbox_id: int | None = None,
) -> dict[str, Any]:
    """Get paginated leads with optional filters."""
    org = await supabase_svc.get_organization_by_account_id(account_id, inbox_id=inbox_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    result = await supabase_svc.get_leads_paginated(
        org_id=org["id"],
        page=page,
        per_page=per_page,
        search=search,
        status=status,
        origin=origin,
    )
    return {"status": "ok", **result}


@leads_router.get("/{account_id}/export")
async def export_leads_csv(
    account_id: int,
    status: str = Query(""),
    origin: str = Query(""),
    inbox_id: int | None = None,
) -> StreamingResponse:
    """Export leads as CSV file."""
    org = await supabase_svc.get_organization_by_account_id(account_id, inbox_id=inbox_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    leads = await supabase_svc.get_leads_for_export(
        org_id=org["id"],
        status=status,
        origin=origin,
    )

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Nome", "Telefone", "Status", "Score", "Tags", "Origem", "Data"])

    for lead in leads:
        tags = ", ".join(lead.get("interest_tags") or [])
        writer.writerow([
            lead.get("name", ""),
            lead.get("phone", ""),
            lead.get("status", ""),
            lead.get("lead_score", 0),
            tags,
            lead.get("origin", ""),
            lead.get("created_at", ""),
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=leads_export.csv",
        },
    )
