"""
SharkPro V2 - Pydantic Schemas for Chatwoot Webhook Payloads

These models mirror the structure sent by Chatwoot on the `message_created` event.
Only the fields we actually use are declared; the rest are silently ignored thanks
to ``model_config = ConfigDict(extra="ignore")``.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ChatwootSender(BaseModel):
    """Sender block inside a Chatwoot message."""

    model_config = ConfigDict(extra="ignore")

    id: int
    name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    type: Optional[str] = None


class ChatwootAttachment(BaseModel):
    """Single attachment within a Chatwoot message."""

    model_config = ConfigDict(extra="ignore")

    id: int
    file_type: str  # "audio", "image", "file", etc.
    data_url: str
    account_id: Optional[int] = None


class ChatwootConversation(BaseModel):
    """Conversation block embedded in the webhook payload."""

    model_config = ConfigDict(extra="ignore")

    id: int
    account_id: int
    inbox_id: Optional[int] = None
    status: Optional[str] = None
    labels: list[str] = []
    contact_inbox: Optional[dict[str, Any]] = None


class ChatwootMessage(BaseModel):
    """The top-level message object inside the webhook body."""

    model_config = ConfigDict(extra="ignore")

    id: int
    content: Optional[str] = None
    message_type: int  # 0 = incoming, 1 = outgoing
    account_id: int
    conversation_id: int  # kept at top level for convenience
    sender: Optional[ChatwootSender] = None
    attachments: list[ChatwootAttachment] = []


class ChatwootWebhookPayload(BaseModel):
    """
    Full Chatwoot webhook payload for the ``message_created`` event.

    Chatwoot sends the message fields at the *top level* of the JSON body,
    alongside an ``event`` key and a nested ``conversation`` object.
    """

    model_config = ConfigDict(extra="ignore")

    event: str

    # -- Message-level fields (top level) --
    id: int
    content: Optional[str] = None
    message_type: int
    account_id: int
    conversation_id: Optional[int] = None

    # -- Nested objects --
    sender: Optional[ChatwootSender] = None
    conversation: Optional[ChatwootConversation] = None
    attachments: list[ChatwootAttachment] = []


# ---------------------------------------------------------------------------
# Transfer webhook payload (Flow 2)
# ---------------------------------------------------------------------------

class TransferPayload(BaseModel):
    """
    Payload for the transfer-to-human endpoint.

    sessionID format: {account_id}-{inbox_id}-{contact_id}-{conversation_id}-{phone}
    """

    model_config = ConfigDict(extra="ignore")

    nome: str
    resumo: str
    company: str = ""
    team_id: Optional[int] = None
    sessionID: str
    url_chatwoot: Optional[str] = None
    apikey_chatwoot: Optional[str] = None
    fluxo_qualificacao: Optional[Any] = None


# ---------------------------------------------------------------------------
# Campaign schemas
# ---------------------------------------------------------------------------

class CampaignCreate(BaseModel):
    """Payload for creating a new campaign."""

    model_config = ConfigDict(extra="ignore")

    account_id: int
    name: str
    template_message: str
    send_interval_seconds: int = 30


class CampaignUpdate(BaseModel):
    """Payload for updating a draft campaign."""

    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    template_message: Optional[str] = None
    send_interval_seconds: Optional[int] = None


# ---------------------------------------------------------------------------
# Instance schemas
# ---------------------------------------------------------------------------

class InstanceCreate(BaseModel):
    """Payload for creating a new WhatsApp instance."""

    model_config = ConfigDict(extra="ignore")

    account_id: int
    display_name: str = ""


class InstanceRegister(BaseModel):
    """Payload for registering an existing Uazapi instance by token."""

    model_config = ConfigDict(extra="ignore")

    account_id: int
    uazapi_token: str
    display_name: str = ""


# ---------------------------------------------------------------------------
# Admin Instance schemas
# ---------------------------------------------------------------------------

class AdminInstanceRegister(BaseModel):
    """Payload for admin registering an existing Uazapi instance to an organization."""

    model_config = ConfigDict(extra="ignore")

    uazapi_token: str
    display_name: str = ""


# ---------------------------------------------------------------------------
# Knowledge schemas
# ---------------------------------------------------------------------------

class KnowledgeSimulate(BaseModel):
    """Payload for testing the RAG knowledge base."""

    model_config = ConfigDict(extra="ignore")

    account_id: int
    question: str
