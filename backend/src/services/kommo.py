"""
SharkPro V2 - Kommo CRM API Client (v4)

Handles contact creation, phone assignment, lead creation,
and note attachment via the Kommo CRM API.
"""

from __future__ import annotations

import json
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
        "Authorization": token if token.startswith("Bearer") else f"Bearer {token}",
    }


async def create_contact(
    subdomain: str,
    token: str,
    name: str,
    responsible_user_id: int = 0,
) -> int:
    """
    Create a contact in Kommo CRM.

    Returns the contact_id of the newly created contact.
    """
    endpoint = f"{subdomain}/api/v4/contacts"
    payload = [{"name": name}]
    if responsible_user_id:
        payload[0]["responsible_user_id"] = responsible_user_id

    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data = response.json()

        # Response can be a string or already parsed
        if isinstance(data, str):
            data = json.loads(data)

        contact_id: int = data["_embedded"]["contacts"][0]["id"]
        logger.info("Kommo contact created: id=%d, name='%s'.", contact_id, name)
        return contact_id
    except httpx.HTTPStatusError as exc:
        logger.error("Kommo API error %d creating contact: %s", exc.response.status_code, exc.response.text)
        raise
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        logger.error("Failed to parse Kommo contact response: %s", exc)
        raise


async def add_phone_to_contact(
    subdomain: str,
    token: str,
    contact_id: int,
    phone: str,
    phone_field_id: int,
    phone_enum_id: int,
) -> dict[str, Any]:
    """Add a phone number to an existing Kommo contact."""
    endpoint = f"{subdomain}/api/v4/contacts/{contact_id}"
    payload = {
        "custom_fields_values": [
            {
                "field_id": phone_field_id,
                "values": [
                    {
                        "value": f"+{phone}" if not phone.startswith("+") else phone,
                        "enum_id": phone_enum_id,
                    }
                ],
            }
        ]
    }

    client = _get_client()
    try:
        response = await client.patch(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Phone added to Kommo contact %d.", contact_id)
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Kommo API error %d adding phone: %s", exc.response.status_code, exc.response.text)
        raise


async def create_lead(
    subdomain: str,
    token: str,
    contact_id: int,
    pipeline_id: int,
    name: str,
    origem: str = "WhatsApp",
    lead_name_field_id: int = 0,
    lead_nome_field_id: int = 0,
    lead_origem_field_id: int = 0,
) -> int:
    """
    Create a lead in Kommo CRM linked to a contact.

    Returns the lead_id.
    """
    endpoint = f"{subdomain}/api/v4/leads"

    lead_data: dict[str, Any] = {
        "name": "Lead Gerado via API",
        "pipeline_id": pipeline_id,
        "_embedded": {
            "contacts": [
                {"id": contact_id, "is_main": True}
            ]
        },
    }

    custom_fields = []
    if lead_name_field_id:
        custom_fields.append({
            "field_id": lead_name_field_id,
            "values": [{"value": name}],
        })
    if lead_nome_field_id:
        custom_fields.append({
            "field_id": lead_nome_field_id,
            "values": [{"value": name}],
        })
    if lead_origem_field_id:
        custom_fields.append({
            "field_id": lead_origem_field_id,
            "values": [{"value": origem}],
        })

    if custom_fields:
        lead_data["custom_fields_values"] = custom_fields

    client = _get_client()
    try:
        response = await client.post(endpoint, json=[lead_data], headers=_headers(token))
        response.raise_for_status()
        data = response.json()

        if isinstance(data, str):
            data = json.loads(data)

        lead_id: int = data["_embedded"]["leads"][0]["id"]
        logger.info("Kommo lead created: id=%d, contact=%d.", lead_id, contact_id)
        return lead_id
    except httpx.HTTPStatusError as exc:
        logger.error("Kommo API error %d creating lead: %s", exc.response.status_code, exc.response.text)
        raise
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        logger.error("Failed to parse Kommo lead response: %s", exc)
        raise


async def add_note_to_lead(
    subdomain: str,
    token: str,
    lead_id: int,
    text: str,
) -> dict[str, Any]:
    """Add a note to a Kommo lead."""
    endpoint = f"{subdomain}/api/v4/leads/notes"
    payload = [
        {
            "entity_id": lead_id,
            "note_type": "common",
            "params": {"text": text},
        }
    ]

    client = _get_client()
    try:
        response = await client.post(endpoint, json=payload, headers=_headers(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        logger.info("Note added to Kommo lead %d.", lead_id)
        return data
    except httpx.HTTPStatusError as exc:
        logger.error("Kommo API error %d adding note: %s", exc.response.status_code, exc.response.text)
        raise


async def close() -> None:
    """Close the shared httpx client."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None
        logger.info("Kommo HTTP client closed.")
