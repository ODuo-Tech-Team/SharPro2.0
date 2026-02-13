"""
SharkPro V2 - Plan Enforcement Middleware

Provides helper to check plan limits before resource creation.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException

from src.services import supabase_client as supabase_svc

logger = logging.getLogger(__name__)


async def check_org_active(org: dict[str, Any]) -> None:
    """
    Check if an organization is active. Raises 403 if blocked.

    Parameters
    ----------
    org: Organization dict (must have 'is_active' field).
    """
    if org.get("is_active") is False:
        logger.warning("Blocked request for inactive org=%s (%s).", org.get("id"), org.get("name"))
        raise HTTPException(
            status_code=403,
            detail={
                "error": "organization_blocked",
                "message": "Esta organização está bloqueada. Entre em contato com o suporte.",
            },
        )


async def check_plan_limit(org_id: str, resource: str) -> dict[str, Any]:
    """
    Check if an organization can create more of a given resource.

    Raises HTTPException 403 if the limit is exceeded.

    Parameters
    ----------
    org_id:   UUID of the organization.
    resource: One of 'users', 'campaigns', 'leads'.

    Returns the limit check result dict.
    """
    result = await supabase_svc.check_plan_limit(org_id, resource)

    if not result["allowed"]:
        logger.warning(
            "Plan limit exceeded for org=%s resource=%s (current=%d, limit=%d, plan=%s).",
            org_id, resource, result["current"], result["limit"], result["plan_name"],
        )
        raise HTTPException(
            status_code=403,
            detail={
                "error": "plan_limit_exceeded",
                "resource": resource,
                "current": result["current"],
                "limit": result["limit"],
                "plan": result["plan_name"],
                "message": f"Limite do plano {result['plan_name']} atingido: {result['current']}/{result['limit']} {resource}.",
            },
        )

    return result
