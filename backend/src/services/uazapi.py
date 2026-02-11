"""
SharkPro V2 - Async Uazapi API Client

Wrapper around the Uazapi REST API for WhatsApp instance management.
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


def _headers(token: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }


async def create_instance(instance_name: str) -> dict[str, Any]:
    """
    Create a new Uazapi instance.

    Returns dict with at least: { token: str, ... }
    """
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance/create"
    payload = {"instanceName": instance_name}
    client = _get_client()
    try:
        response = await client.post(url, json=payload, headers=_headers(settings.uazapi_global_token))
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


async def set_webhook(instance_name: str, instance_token: str, webhook_url: str) -> dict[str, Any]:
    """Configure the webhook URL for a Uazapi instance."""
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance/{instance_name}/webhook"
    payload = {"webhookUrl": webhook_url}
    client = _get_client()
    try:
        response = await client.put(url, json=payload, headers=_headers(instance_token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Webhook set for instance '%s'.", instance_name)
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Uazapi API error %d setting webhook: %s", exc.response.status_code, exc.response.text)
        raise


async def get_qr_code(instance_name: str, instance_token: str) -> dict[str, Any]:
    """
    Request a QR code for pairing a WhatsApp device.

    Returns dict with at least: { qrcode: str (base64) }
    """
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance/{instance_name}/qrcode"
    client = _get_client()
    try:
        response = await client.get(url, headers=_headers(instance_token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("QR code fetched for instance '%s'.", instance_name)
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Uazapi API error %d fetching QR: %s", exc.response.status_code, exc.response.text)
        raise


async def get_instance_status(instance_name: str, instance_token: str) -> dict[str, Any]:
    """Check the connection status of a Uazapi instance."""
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance/{instance_name}/status"
    client = _get_client()
    try:
        response = await client.get(url, headers=_headers(instance_token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Uazapi API error %d checking status: %s", exc.response.status_code, exc.response.text)
        raise


async def delete_instance(instance_name: str) -> dict[str, Any]:
    """Delete a Uazapi instance."""
    settings = get_settings()
    url = f"{settings.uazapi_base_url}/instance/{instance_name}/delete"
    client = _get_client()
    try:
        response = await client.delete(url, headers=_headers(settings.uazapi_global_token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Uazapi instance '%s' deleted.", instance_name)
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
