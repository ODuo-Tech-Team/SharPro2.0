"""
SharkPro V2 - AI Engine (OpenAI ChatCompletion Wrapper)

Encapsulates all interaction with the OpenAI API:
  - Tool / function-calling schema definitions
  - Chat completion requests
  - Tool-call result processing

Tools available:
  - transfer_to_human_specialist: Transfer to human + Chatwoot + Kommo CRM
  - register_lead: Register a new sales lead
  - handle_customer_inactivity: Process stale tickets
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from openai import AsyncOpenAI

from src.config import get_settings
from src.services import chatwoot as chatwoot_svc
from src.services import redis_client as redis_svc
from src.services import supabase_client as supabase_svc
from src.services.transfer import execute_transfer
from src.services.inactivity import process_stale_atendimentos

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal note instruction (appended to every system prompt)
# ---------------------------------------------------------------------------

INTERNAL_NOTE_INSTRUCTION = (
    "\n\n[INSTRUCAO DO SISTEMA - NOTAS INTERNAS]\n"
    "Quando voce quiser fazer uma observacao interna para o agente humano "
    "(analise do cliente, feedback sobre a conversa, sugestoes de abordagem, "
    "alertas sobre comportamento do cliente, etc.), escreva essa parte "
    "dentro das tags [NOTA_INTERNA] e [/NOTA_INTERNA].\n"
    "Exemplo:\n"
    "[NOTA_INTERNA]O cliente esta demonstrando interesse no produto X. "
    "Sugerir promocao ativa.[/NOTA_INTERNA]\n"
    "O texto FORA dessas tags sera enviado ao cliente normalmente. "
    "O texto DENTRO sera visivel apenas para os agentes internos.\n"
    "Use notas internas para: analises, feedbacks, alertas, sugestoes de venda, "
    "observacoes sobre o comportamento do cliente.\n"
    "NUNCA envie analises internas diretamente ao cliente.\n"
    "[/INSTRUCAO DO SISTEMA]"
)

# ---------------------------------------------------------------------------
# Tool definitions (OpenAI function-calling schema)
# ---------------------------------------------------------------------------

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "transfer_to_human_specialist",
            "description": (
                "Transfer the conversation to a human specialist. "
                "Call this when the customer explicitly asks to speak with a human, "
                "when the request is outside the AI's capabilities, or when the "
                "customer needs specialized support. This will open the ticket, "
                "assign to the support team, create CRM records, and notify agents."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": (
                            "Brief summary of the conversation so far. "
                            "Include the customer's main request, context, and any "
                            "relevant details the human agent should know."
                        ),
                    },
                    "contact_name": {
                        "type": "string",
                        "description": "Full name of the contact/customer.",
                    },
                    "contact_phone": {
                        "type": "string",
                        "description": "Phone number of the contact (with country code, e.g. 5519999999999).",
                    },
                },
                "required": ["summary"],
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
    {
        "type": "function",
        "function": {
            "name": "handle_customer_inactivity",
            "description": (
                "Process tickets that have been inactive/pending for too long. "
                "Call this if you detect the customer has been unresponsive or "
                "if there are stale tickets that need attention. This will open "
                "the tickets, assign them to the support team, and notify agents."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
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

    # Metadata from the atendimento (for transfer)
    session_id: Optional[str] = None
    company: Optional[str] = None
    team_id: Optional[int] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None

    # Will be set to True if transfer_to_human_specialist is called
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

    # ---------------------------------------------------------------
    # Tool 1: transfer_to_human_specialist
    # ---------------------------------------------------------------
    if name == "transfer_to_human_specialist":
        summary = arguments.get("summary", "Cliente solicitou atendimento humano.")
        contact_name = arguments.get("contact_name") or ctx.contact_name or "Desconhecido"
        contact_phone = arguments.get("contact_phone") or ctx.contact_phone or ""

        logger.info(
            "Tool: transfer_to_human_specialist for conversation %d (account %d).",
            ctx.conversation_id, ctx.account_id,
        )

        # Build sessionID if not available
        session_id = ctx.session_id
        if not session_id:
            session_id = f"{ctx.account_id}-0-{ctx.contact_id or 0}-{ctx.conversation_id}-{contact_phone}"

        # Set takeover flag FIRST to prevent AI from responding during transfer
        await redis_svc.set_human_takeover(ctx.conversation_id)
        ctx.transferred = True

        try:
            result = await execute_transfer(
                nome=contact_name,
                resumo=summary,
                company=ctx.company or "",
                team_id=ctx.team_id,
                session_id=session_id,
                url_chatwoot_override=ctx.chatwoot_url,
                apikey_chatwoot_override=ctx.chatwoot_token,
            )
            return result
        except Exception as exc:
            logger.exception("transfer_to_human_specialist failed.")
            # Fallback: at least toggle status (flag already set above)
            try:
                await chatwoot_svc.toggle_status(
                    url=ctx.chatwoot_url, token=ctx.chatwoot_token,
                    account_id=ctx.account_id, conversation_id=ctx.conversation_id,
                    status="open",
                )
            except Exception:
                pass
            return f"Transferencia parcial realizada. Erro: {exc}"

    # ---------------------------------------------------------------
    # Tool 2: register_lead
    # ---------------------------------------------------------------
    if name == "register_lead":
        lead_name: str = arguments.get("name", "")
        lead_phone: str = arguments.get("phone", "")
        logger.info(
            "Tool: register_lead('%s', '%s') for org %s.",
            lead_name, lead_phone, ctx.organization_id,
        )

        # Check plan limit for leads
        limit_check = await supabase_svc.check_plan_limit(ctx.organization_id, "leads")
        if not limit_check["allowed"]:
            logger.warning(
                "Leads limit reached for org %s (%d/%d). Skipping register_lead.",
                ctx.organization_id, limit_check["current"], limit_check["limit"],
            )
            return (
                f"Limite de leads do plano atingido ({limit_check['current']}/{limit_check['limit']}). "
                f"Faca upgrade do plano para registrar mais leads."
            )

        await supabase_svc.insert_lead(
            org_id=ctx.organization_id,
            name=lead_name,
            phone=lead_phone,
            contact_id=ctx.contact_id,
        )
        return f"Lead '{lead_name}' registrado com sucesso."

    # ---------------------------------------------------------------
    # Tool 3: handle_customer_inactivity
    # ---------------------------------------------------------------
    if name == "handle_customer_inactivity":
        logger.info("Tool: handle_customer_inactivity triggered.")
        try:
            count = await process_stale_atendimentos()
            return f"{count} atendimento(s) inativos processados com sucesso."
        except Exception as exc:
            logger.exception("handle_customer_inactivity failed.")
            return f"Erro ao processar inatividade: {exc}"

    logger.warning("Unknown tool called: %s", name)
    return f"Ferramenta desconhecida: {name}"


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

    # Build the messages list (append internal note instruction to system prompt)
    full_system_prompt = ctx.system_prompt + INTERNAL_NOTE_INSTRUCTION
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": full_system_prompt},
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


# ---------------------------------------------------------------------------
# Smart Handoff - Summary generation for human takeover
# ---------------------------------------------------------------------------

async def generate_handoff_summary(messages: list[dict[str, Any]]) -> str:
    """
    Generate a brief conversation summary for human agent handoff.

    Uses GPT-4o-mini for fast, cheap summarization of recent messages.
    Returns a concise summary in Portuguese.
    """
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    # Build conversation text from last 20 messages
    conversation_text = ""
    for msg in messages[-20:]:
        sender = msg.get("sender", {})
        msg_type = msg.get("message_type", 0)
        name = sender.get("name", "Cliente" if msg_type == 0 else "Agente")
        content = msg.get("content", "")
        if content and not msg.get("private", False):
            conversation_text += f"{name}: {content}\n"

    if not conversation_text.strip():
        return "Sem mensagens recentes para resumir."

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Voce e um assistente que resume conversas de atendimento ao cliente. "
                        "Gere um resumo conciso em portugues (max 3-4 frases) contendo: "
                        "1) O que o cliente quer/precisa "
                        "2) O que ja foi discutido/resolvido "
                        "3) Ponto atual da conversa "
                        "4) Qualquer informacao importante (nome, telefone, produto mencionado). "
                        "Seja direto e objetivo."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Resuma esta conversa para o agente humano:\n\n{conversation_text}",
                },
            ],
            temperature=0.3,
            max_tokens=300,
        )
        return response.choices[0].message.content or "Resumo indisponivel."
    except Exception as exc:
        logger.warning("Failed to generate handoff summary: %s", exc)
        return f"Erro ao gerar resumo: {exc}"
