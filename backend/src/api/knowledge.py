"""
SharkPro V2 - Knowledge Base API Routes

Provides endpoints for managing the RAG knowledge base:
  - POST   /api/knowledge/upload      -- Upload a PDF file for processing
  - GET    /api/knowledge/files/{id}   -- List knowledge files for an org
  - DELETE /api/knowledge/files/{id}   -- Delete a knowledge file
  - POST   /api/knowledge/simulate     -- Test RAG with a question
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from src.services import supabase_client as supabase_svc
from src.services import rabbitmq as rmq
from src.services.knowledge_service import process_pdf, search_knowledge
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
    """
    Upload a PDF file and process it into the knowledge base.

    The file is processed synchronously (chunks + embeddings) since
    we need to give immediate feedback. For very large files, consider
    async processing via RabbitMQ.
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Get org
    org = await supabase_svc.get_organization_by_account_id(account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    org_id = org["id"]

    # Read file
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 20MB.")

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    # Create file record
    file_record = await supabase_svc.insert_knowledge_file(
        org_id=org_id,
        file_name=file.filename,
        file_size=len(file_bytes),
        mime_type=file.content_type or "application/pdf",
    )

    file_id = file_record.get("id")
    if not file_id:
        raise HTTPException(status_code=500, detail="Failed to create file record.")

    # Process PDF (sync for now - could be async via RabbitMQ for large files)
    try:
        await process_pdf(
            file_bytes=file_bytes,
            file_name=file.filename,
            org_id=org_id,
            file_id=file_id,
        )
    except Exception:
        logger.exception("Failed to process uploaded PDF.")
        # Status already set to 'error' by process_pdf

    # Refetch to get updated status
    files = await supabase_svc.get_knowledge_files(org_id)
    updated = next((f for f in files if f["id"] == file_id), file_record)

    return {"status": "ok", "file": updated}


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
    """Delete a knowledge file and all its vectors."""
    try:
        await supabase_svc.delete_knowledge_file(file_id)
        return {"status": "ok", "detail": "File deleted."}
    except Exception:
        logger.exception("Failed to delete knowledge file %s.", file_id)
        raise HTTPException(status_code=500, detail="Failed to delete file.")


@knowledge_router.post("/simulate")
async def simulate_knowledge(payload: KnowledgeSimulate) -> dict[str, Any]:
    """
    Test the RAG knowledge base with a question.

    Returns the AI response along with the context chunks used.
    """
    org = await supabase_svc.get_organization_by_account_id(payload.account_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    org_id = org["id"]

    # Search knowledge base
    context = await search_knowledge(org_id, payload.question)

    if not context:
        return {
            "status": "ok",
            "answer": "Nenhum conhecimento relevante encontrado na base. Envie arquivos PDF primeiro.",
            "context_used": "",
        }

    # Build prompt with context
    system_prompt = org.get("system_prompt") or "Voce e um assistente util."
    full_prompt = (
        f"{system_prompt}\n\n"
        f"[CONHECIMENTO DA BASE]\n{context}\n[/CONHECIMENTO DA BASE]\n"
        f"Use estas informacoes para responder quando relevante."
    )

    # Call OpenAI
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
        "context_used": context[:500] + "..." if len(context) > 500 else context,
    }
