"""
SharkPro V2 - Async Uazapi API Client

Wrapper around the Uazapi REST API for WhatsApp instance management.

Auth:
  - Instance endpoints use header ``token`` (the per-instance token).
  - Admin endpoints use header ``admintoken`` (the global admin token).
  - The instance is identified by the token, NOT by name in the URL.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from src.config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True,
        )
    return _client


def _admin_headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "Content-Type": "application/json",
        "admintoken": settings.uazapi_global_token,
    }


def _instance_headers(token: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "token": token,
    }


async def create_instance(instance_name: str) -> dict[str, Any]:
    """
    Create a new Uazapi instance (admin endpoint).

    POST /instance/init  with admintoken header.
    Returns dict with at least: { token: str, ... }
    """
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance/init"
    payload = {"name": instance_name}
    client = _get_client()
    try:
        response = await client.post(url, json=payload, headers=_admin_headers())
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Uazapi instance '%s' created.", instance_name)
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Uazapi API error %d creating instance: %s", exc.response.status_code, exc.response.text)
        raise
    except httpx.RequestError:
        logger.exception("Network error creating Uazapi instance.")
        raise


async def connect_instance(instance_token: str, phone: str = "") -> dict[str, Any]:
    """
    Start connection process (generates QR code or pairing code).

    POST /instance/connect  with instance token header.
    If phone is provided, generates pairing code. If omitted, generates QR code.
    """
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance/connect"
    payload: dict[str, Any] = {}
    if phone:
        payload["phone"] = phone
    client = _get_client()
    try:
        response = await client.post(url, json=payload, headers=_instance_headers(instance_token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Uazapi connect initiated (QR/pairing code generated).")
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Uazapi API error %d connecting: %s", exc.response.status_code, exc.response.text)
        raise


async def get_instance_status(instance_token: str) -> dict[str, Any]:
    """
    Check instance status (also returns QR code if connecting).

    GET /instance/status  with instance token header.
    """
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance/status"
    client = _get_client()
    try:
        response = await client.get(url, headers=_instance_headers(instance_token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Uazapi API error %d checking status: %s", exc.response.status_code, exc.response.text)
        raise


async def set_webhook(instance_token: str, webhook_url: str) -> dict[str, Any]:
    """Configure the webhook URL for a Uazapi instance."""
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance/webhook"
    payload = {"webhookUrl": webhook_url}
    client = _get_client()
    try:
        response = await client.put(url, json=payload, headers=_instance_headers(instance_token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Webhook set for instance.")
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Uazapi API error %d setting webhook: %s", exc.response.status_code, exc.response.text)
        raise


async def delete_instance(instance_token: str) -> dict[str, Any]:
    """
    Delete a Uazapi instance.

    DELETE /instance  with instance token header.
    """
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance"
    client = _get_client()
    try:
        response = await client.delete(url, headers=_instance_headers(instance_token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Uazapi instance deleted.")
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Uazapi API error %d deleting instance: %s", exc.response.status_code, exc.response.text)
        raise


async def close() -> None:
    """Close the shared httpx client."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None
        logger.info("Uazapi HTTP client closed.")
