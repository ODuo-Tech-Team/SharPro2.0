"""
SharkPro V2 - AI Engine (OpenAI ChatCompletion Wrapper)

Encapsulates all interaction with the OpenAI API:
  - Tool / function-calling schema definitions
  - Chat completion requests
  - Tool-call result processing (transfer_to_human, register_lead)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from openai import AsyncOpenAI

from src.config import get_settings
from src.services import chatwoot as chatwoot_svc
from src.services import supabase_client as supabase_svc

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool definitions (OpenAI function-calling schema)
# ---------------------------------------------------------------------------

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "transfer_to_human",
            "description": (
                "Transfer the conversation to a human agent. "
                "Use this when the customer explicitly asks for a human, "
                "or when the request is outside the AI's capabilities."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "register_lead",
            "description": (
                "Register a new sales lead. Call this once you have captured "
                "the prospect's name and phone number during the conversation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Full name of the lead.",
                    },
                    "phone": {
                        "type": "string",
                        "description": "Phone number of the lead (with country code).",
                    },
                },
                "required": ["name", "phone"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Conversation context dataclass
# ---------------------------------------------------------------------------

@dataclass
class ConversationContext:
    """Holds all the data the AI engine needs to process one turn."""

    organization_id: str
    chatwoot_url: str
    chatwoot_token: str
    account_id: int
    conversation_id: int
    system_prompt: str
    user_message: str
    contact_id: Optional[int] = None
    history: list[dict[str, str]] = field(default_factory=list)

    # Will be set to True if transfer_to_human is called
    transferred: bool = False


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

async def _execute_tool_call(
    name: str,
    arguments: dict[str, Any],
    ctx: ConversationContext,
) -> str:
    """
    Execute a tool call and return a human-readable result string.

    Side effects (API calls, DB writes) happen here.
    """
    if name == "transfer_to_human":
        logger.info(
            "Tool: transfer_to_human for conversation %d (account %d).",
            ctx.conversation_id,
            ctx.account_id,
        )
        await chatwoot_svc.toggle_status(
            url=ctx.chatwoot_url,
            token=ctx.chatwoot_token,
            account_id=ctx.account_id,
            conversation_id=ctx.conversation_id,
            status="open",
        )
        ctx.transferred = True
        return "Conversation transferred to a human agent successfully."

    if name == "register_lead":
        lead_name: str = arguments.get("name", "")
        lead_phone: str = arguments.get("phone", "")
        logger.info(
            "Tool: register_lead('%s', '%s') for org %s.",
            lead_name,
            lead_phone,
            ctx.organization_id,
        )
        await supabase_svc.insert_lead(
            org_id=ctx.organization_id,
            name=lead_name,
            phone=lead_phone,
            contact_id=ctx.contact_id,
        )
        return f"Lead '{lead_name}' registered successfully."

    logger.warning("Unknown tool called: %s", name)
    return f"Unknown tool: {name}"


# ---------------------------------------------------------------------------
# Main AI call
# ---------------------------------------------------------------------------

async def run_completion(ctx: ConversationContext) -> str:
    """
    Run a full OpenAI ChatCompletion turn, handling any tool calls.

    Returns the final assistant text message.  If ``ctx.transferred`` is
    ``True`` after this call, the caller should NOT send the response to
    the user (the conversation is now with a human).
    """
    settings = get_settings()

    # Use per-org OpenAI key if present; fall back to the global key.
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    # Build the messages list
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": ctx.system_prompt},
    ]
    # Append conversation history
    messages.extend(ctx.history)
    # Append the current user turn
    messages.append({"role": "user", "content": ctx.user_message})

    logger.debug("Sending %d messages to OpenAI (%s).", len(messages), settings.openai_model)

    response = await client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        temperature=0.7,
        max_tokens=1024,
    )

    assistant_message = response.choices[0].message

    # ----- Handle tool calls (iterative loop) -----
    # OpenAI may return one or more tool_calls; we execute them all,
    # feed the results back, and request another completion.
    max_tool_rounds = 5
    current_round = 0

    while assistant_message.tool_calls and current_round < max_tool_rounds:
        current_round += 1
        logger.info("Processing %d tool call(s) (round %d).", len(assistant_message.tool_calls), current_round)

        # Add the assistant message with tool_calls to history
        messages.append(assistant_message.model_dump())

        for tool_call in assistant_message.tool_calls:
            fn_name = tool_call.function.name
            try:
                fn_args = json.loads(tool_call.function.arguments) if tool_call.function.arguments else {}
            except json.JSONDecodeError:
                fn_args = {}

            result_str = await _execute_tool_call(fn_name, fn_args, ctx)

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result_str,
                }
            )

        # If the conversation was transferred, we can stop early.
        if ctx.transferred:
            return "Conversa transferida para um atendente humano. Obrigado!"

        # Request a follow-up completion
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=1024,
        )
        assistant_message = response.choices[0].message

    final_text = assistant_message.content or ""
    logger.info("AI response generated (%d chars) for conversation %d.", len(final_text), ctx.conversation_id)
    return final_text
