"""
SharkPro V2 - Knowledge Base API Routes

  - POST   /api/knowledge/upload      -- Upload a PDF, extract text, add to knowledge
  - GET    /api/knowledge/files/{id}   -- List knowledge files for an org
  - DELETE /api/knowledge/files/{id}   -- Delete a knowledge file
  - POST   /api/knowledge/simulate     -- Test knowledge with a question
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from src.services import supabase_client as supabase_svc
from src.services.knowledge_service import extract_text_from_pdf
from src.api.schemas import KnowledgeSimulate
from src.config import get_settings

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

knowledge_router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


@knowledge_router.post("/upload")
async def upload_knowledge_file(
    file: UploadFile = File(...),
    account_id: int = Form(...),
) -> dict[str, Any]:
    """Upload a PDF file, extract its text, and store as knowledge."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    org_id = org["id"]

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 20MB.")
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    # Extract text from PDF
    try:
        text = extract_text_from_pdf(file_bytes)
    except Exception:
        logger.exception("Failed to extract text from PDF '%s'.", file.filename)
        raise HTTPException(status_code=400, detail="Failed to read PDF. Check if file is valid.")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text found in PDF.")

    # Create file record with extracted content
    file_record = await supabase_svc.insert_knowledge_file(
        org_id=org_id,
        file_name=file.filename,
        file_size=len(file_bytes),
        mime_type=file.content_type or "application/pdf",
        content=text.strip(),
    )

    return {"status": "ok", "file": file_record}


@knowledge_router.get("/files/{account_id}")
async def list_knowledge_files(account_id: int) -> dict[str, Any]:
    """List all knowledge files for an organization."""
    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    files = await supabase_svc.get_knowledge_files(org["id"])
    return {"status": "ok", "files": files}


@knowledge_router.delete("/files/{file_id}")
async def delete_knowledge_file(file_id: str) -> dict[str, str]:
    """Delete a knowledge file."""
    try:
        await supabase_svc.delete_knowledge_file(file_id)
        return {"status": "ok", "detail": "File deleted."}
    except Exception:
        logger.exception("Failed to delete knowledge file %s.", file_id)
        raise HTTPException(status_code=500, detail="Failed to delete file.")


@knowledge_router.post("/simulate")
async def simulate_knowledge(payload: KnowledgeSimulate) -> dict[str, Any]:
    """Test the knowledge base with a question."""
    org = await supabase_svc.get_organization_by_account_id(payload.account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    # Get all knowledge content for the org
    knowledge_text = await supabase_svc.get_all_knowledge_content(org["id"])

    if not knowledge_text:
        return {
            "status": "ok",
            "answer": "Nenhum conhecimento na base. Envie arquivos PDF primeiro.",
            "context_used": "",
        }

    system_prompt = org.get("system_prompt") or "Você é um assistente útil."
    full_prompt = (
        f"{system_prompt}\n\n"
        f"[CONHECIMENTO DA BASE]\n{knowledge_text}\n[/CONHECIMENTO DA BASE]\n"
        f"Use estas informações para responder quando relevante."
    )

    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": full_prompt},
                {"role": "user", "content": payload.question},
            ],
            temperature=0.7,
            max_tokens=1024,
        )
        answer = response.choices[0].message.content or "Sem resposta."
    except Exception:
        logger.exception("OpenAI call failed in knowledge simulate.")
        answer = "Erro ao gerar resposta. Verifique sua chave OpenAI."

    return {
        "status": "ok",
        "answer": answer,
        "context_used": knowledge_text[:500] + "..." if len(knowledge_text) > 500 else knowledge_text,
    }
