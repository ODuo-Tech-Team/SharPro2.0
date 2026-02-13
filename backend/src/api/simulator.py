"""
SharkPro V2 - Chat Simulator API

POST /api/chat/simulate -- Full multi-turn chat simulation using the same
AI engine as production. Tools are mocked (no real leads, no transfers).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from fastapi import APIRouter, HTTPException

from src.services import supabase_client as supabase_svc
from src.api.schemas import ChatSimulateRequest
from src.worker.ai_engine import ConversationContext, run_completion

logger = logging.getLogger(__name__)

simulator_router = APIRouter(prefix="/api/chat", tags=["simulator"])

_NOTA_RE = re.compile(r"\[NOTA_INTERNA\](.*?)\[/NOTA_INTERNA\]", re.DOTALL)
_QUAL_RE = re.compile(r"\[QUALIFICACAO\](.*?)\[/QUALIFICACAO\]", re.DOTALL)


def _parse_response(text: str) -> dict[str, Any]:
    """Extract internal notes, qualification, and clean client text."""
    notes = [n.strip() for n in _NOTA_RE.findall(text) if n.strip()]
    qual_match = _QUAL_RE.search(text)
    qualification = None
    if qual_match:
        try:
            qualification = json.loads(qual_match.group(1).strip())
        except (json.JSONDecodeError, ValueError):
            pass

    clean = _NOTA_RE.sub("", text)
    clean = _QUAL_RE.sub("", clean).strip()

    return {
        "clean_text": clean,
        "internal_notes": notes,
        "qualification": qualification,
    }


@simulator_router.post("/simulate")
async def simulate_chat(payload: ChatSimulateRequest) -> dict[str, Any]:
    """
    Full multi-turn chat simulation.

    Uses the same AI engine, prompt, knowledge base, and personality
    as production. Tools are mocked -- no real side effects.
    """
    # Lookup by org_id directly (more reliable than account_id)
    org = await supabase_svc.get_organization_by_id(payload.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    org_id = org["id"]
    system_prompt = org.get("system_prompt") or (
        "Você é um assistente de vendas. Seja educado e prestativo."
    )
    ai_config = org.get("ai_config") or {}

    history = [
        {"role": msg.role, "content": msg.content}
        for msg in payload.history
    ]

    handoff_config = org.get("ai_handoff_config") or {}
    farewell = handoff_config.get("farewell_message") if isinstance(handoff_config, dict) else None

    ctx = ConversationContext(
        organization_id=org_id,
        chatwoot_url="",
        chatwoot_token="",
        account_id=payload.account_id,
        conversation_id=0,
        system_prompt=system_prompt,
        user_message=payload.message,
        contact_id=None,
        history=history,
        company=org.get("name", ""),
        team_id=handoff_config.get("team_id") if isinstance(handoff_config, dict) else None,
        contact_name="Simulador",
        contact_phone="0000000000000",
        farewell_message=farewell,
        ai_config=ai_config,
        simulate=True,
    )

    try:
        raw_response = await run_completion(ctx)
    except Exception:
        logger.exception("Simulation failed for org %s.", org_id)
        raise HTTPException(
            status_code=500,
            detail="Erro ao gerar resposta. Verifique a chave OpenAI.",
        )

    parsed = _parse_response(raw_response)

    return {
        "status": "ok",
        "response": parsed["clean_text"],
        "internal_notes": parsed["internal_notes"],
        "qualification": parsed["qualification"],
        "transferred": ctx.transferred,
    }
