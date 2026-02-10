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


async def send_private_message(
    url: str,
    token: str,
    account_id: int,
    conversation_id: int,
    content: str,
    in_reply_to: int | None = None,
) -> dict[str, Any]:
    """Send a private (internal) message to a Chatwoot conversation."""
    endpoint = f"{url}/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages"
    payload: dict[str, Any] = {
        "content": content,
        "message_type": "outgoing",
        "private": True,
    }
    if in_reply_to:
        payload["content_attributes"] = {"in_reply_to": in_reply_to}
    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Private message sent to conversation %d.", conversation_id)
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Chatwoot API error %d sending private message: %s", exc.response.status_code, exc.response.text)
        raise


async def send_message_with_reply(
    url: str,
    token: str,
    account_id: int,
    conversation_id: int,
    content: str,
    message_id: int | None = None,
    private: bool = False,
) -> dict[str, Any]:
    """Send a message with optional in_reply_to threading."""
    endpoint = f"{url}/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages"
    payload: dict[str, Any] = {
        "content": content,
        "content_type": "text",
        "message_type": "outgoing",
        "private": private,
    }
    if message_id:
        payload["content_attributes"] = {"in_reply_to": message_id}
    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        logger.error("Chatwoot API error %d: %s", exc.response.status_code, exc.response.text)
        raise


async def assign_team(
    url: str,
    token: str,
    account_id: int,
    conversation_id: int,
    team_id: int,
) -> dict[str, Any]:
    """Assign a conversation to a team."""
    endpoint = f"{url}/api/v1/accounts/{account_id}/conversations/{conversation_id}/assignments"
    payload = {"team_id": team_id}
    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Conversation %d assigned to team %d.", conversation_id, team_id)
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Chatwoot API error %d assigning team: %s", exc.response.status_code, exc.response.text)
        raise


async def create_contact_note(
    url: str,
    token: str,
    account_id: int,
    contact_id: int,
    content: str,
) -> dict[str, Any]:
    """Create a note on a Chatwoot contact."""
    endpoint = f"{url}/api/v1/accounts/{account_id}/contacts/{contact_id}/notes"
    payload = {"content": content}
    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Note created on contact %d.", contact_id)
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Chatwoot API error %d creating note: %s", exc.response.status_code, exc.response.text)
        raise


async def create_kanban_card(
    url: str,
    token: str,
    account_id: int,
    conversation_id: int,
    funnel_id: int,
    stage_id: str,
    title: str,
    description: str = "Atendido pelo Bot",
) -> dict[str, Any] | None:
    """Create a Kanban card in a Chatwoot funnel."""
    endpoint = f"{url}/api/v1/accounts/{account_id}/kanban_items"
    payload = {
        "kanban_item": {
            "funnel_id": funnel_id,
            "funnel_stage": stage_id,
            "position": 0,
            "conversation_display_id": conversation_id,
            "item_details": {
                "title": title,
                "description": description,
                "priority": "normal",
                "value": 0,
                "conversation_id": conversation_id,
            },
        }
    }
    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Kanban card created for conversation %d.", conversation_id)
        return data
    except httpx.HTTPStatusError as exc:
        logger.warning("Kanban card creation failed (non-critical): %s", exc.response.text)
        return None


async def create_kanban_note(
    url: str,
    token: str,
    account_id: int,
    kanban_item_id: int,
    text: str,
) -> dict[str, Any] | None:
    """Add a note to a Kanban card."""
    endpoint = f"{url}/api/v1/accounts/{account_id}/kanban_items/{kanban_item_id}/create_note"
    payload = {"text": text}
    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Note added to kanban item %d.", kanban_item_id)
        return data
    except httpx.HTTPStatusError as exc:
        logger.warning("Kanban note creation failed (non-critical): %s", exc.response.text)
        return None


async def close() -> None:
    """Close the shared httpx client."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None
        logger.info("Chatwoot HTTP client closed.")
