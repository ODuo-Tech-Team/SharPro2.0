"""
SharkPro V2 - Async Chatwoot API Client

Thin wrapper around the Chatwoot v1 API using httpx.
Every call is fully async and includes retries for transient failures.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

# Shared client – created lazily, reused across calls for connection pooling.
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
        "api_access_token": token,
    }


async def send_message(
    url: str,
    token: str,
    account_id: int,
    conversation_id: int,
    content: str,
    message_type: str = "outgoing",
) -> dict[str, Any]:
    """
    Send a text message to a Chatwoot conversation.

    Parameters
    ----------
    url:        Chatwoot base URL (e.g. ``https://chat.example.com``).
    token:      API access token for the Chatwoot account.
    account_id: Chatwoot account numeric ID.
    conversation_id: Target conversation ID.
    content:    Message body text.
    message_type: ``"outgoing"`` (default) or ``"incoming"``.

    Returns the JSON response from Chatwoot.
    """
    endpoint = f"{url}/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages"
    payload = {
        "content": content,
        "message_type": message_type,
        "private": False,
    }
    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info(
            "Message sent to conversation %d (account %d).",
            conversation_id,
            account_id,
        )
        return data
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Chatwoot API error %d when sending message: %s",
            exc.response.status_code,
            exc.response.text,
        )
        raise
    except httpx.RequestError:
        logger.exception("Network error sending message to Chatwoot.")
        raise


async def toggle_status(
    url: str,
    token: str,
    account_id: int,
    conversation_id: int,
    status: str = "open",
) -> dict[str, Any]:
    """
    Change the status of a Chatwoot conversation.

    Common statuses: ``"open"``, ``"resolved"``, ``"pending"``.
    """
    endpoint = (
        f"{url}/api/v1/accounts/{account_id}/conversations/{conversation_id}/toggle_status"
    )
    payload = {"status": status}
    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info(
            "Conversation %d status toggled to '%s'.",
            conversation_id,
            status,
        )
        return data
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Chatwoot API error %d toggling status: %s",
            exc.response.status_code,
            exc.response.text,
        )
        raise
    except httpx.RequestError:
        logger.exception("Network error toggling conversation status.")
        raise


async def get_messages(
    url: str,
    token: str,
    account_id: int,
    conversation_id: int,
) -> list[dict[str, Any]]:
    """
    Retrieve recent messages from a Chatwoot conversation.

    Returns a list of message dicts ordered chronologically.
    """
    endpoint = (
        f"{url}/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages"
    )
    client = _get_client()
    try:
        response = await client.get(endpoint, headers=_headers(token))
        response.raise_for_status()
        data = response.json()
        # Chatwoot wraps messages inside a `payload` key.
        messages: list[dict[str, Any]] = data.get("payload", [])
        logger.debug(
            "Fetched %d messages from conversation %d.",
            len(messages),
            conversation_id,
        )
        return messages
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Chatwoot API error %d fetching messages: %s",
            exc.response.status_code,
            exc.response.text,
        )
        raise
    except httpx.RequestError:
        logger.exception("Network error fetching messages from Chatwoot.")
        raise


async def close() -> None:
    """Close the shared httpx client."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None
        logger.info("Chatwoot HTTP client closed.")
