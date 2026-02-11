"""
SharkPro V2 - Authentication & Authorization Middleware

Provides FastAPI dependencies for:
  - JWT validation via Supabase GoTrue
  - Super admin authorization check
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, HTTPException, Request

from src.services import supabase_client as supabase_svc

logger = logging.getLogger(__name__)


async def get_current_user(request: Request) -> dict[str, Any]:
    """
    Extract and validate the JWT from the Authorization header.

    Returns the authenticated user dict from Supabase.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty token")

    user = await supabase_svc.validate_user_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return user


async def check_superadmin(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Verify the authenticated user is a super admin.

    Depends on get_current_user. Returns the user if authorized, else 403.
    """
    user_id = user.get("id", "")
    profile = await supabase_svc.get_profile_by_user_id(user_id)

    if not profile or not profile.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Super admin access required")

    return user
