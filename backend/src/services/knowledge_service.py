"""
SharkPro V2 - Knowledge Service (RAG Pipeline)

Handles PDF text extraction, chunking, embedding generation,
and vector similarity search for the knowledge base.
"""

from __future__ import annotations

import logging
from typing import Any

from openai import AsyncOpenAI

from src.config import get_settings
from src.services import supabase_client as supabase_svc

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
CHUNK_SIZE = 500  # approximate tokens per chunk
CHUNK_OVERLAP = 50  # overlap between chunks


def _extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes using PyPDF2."""
    from PyPDF2 import PdfReader
    import io

    reader = PdfReader(io.BytesIO(file_bytes))
    text_parts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)
    return "\n".join(text_parts)


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks by approximate word count."""
    words = text.split()
    if not words:
        return []

    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        if chunk.strip():
            chunks.append(chunk.strip())
        start = end - overlap

    return chunks


async def _generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using OpenAI."""
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    # Process in batches of 100 (OpenAI limit)
    all_embeddings: list[list[float]] = []
    batch_size = 100

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=batch,
        )
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    return all_embeddings


async def process_pdf(
    file_bytes: bytes,
    file_name: str,
    org_id: str,
    file_id: str,
) -> None:
    """
    Full RAG pipeline: PDF -> text -> chunks -> embeddings -> store.

    Updates the knowledge_files status on completion or error.
    """
    try:
        logger.info("Processing PDF '%s' for org %s (file_id=%s).", file_name, org_id, file_id)

        # 1. Extract text
        text = _extract_text_from_pdf(file_bytes)
        if not text.strip():
            logger.warning("No text extracted from PDF '%s'.", file_name)
            await supabase_svc.update_knowledge_file_status(file_id, "error", 0)
            return

        logger.info("Extracted %d chars from '%s'.", len(text), file_name)

        # 2. Chunk
        chunks = _chunk_text(text)
        if not chunks:
            logger.warning("No chunks generated from PDF '%s'.", file_name)
            await supabase_svc.update_knowledge_file_status(file_id, "error", 0)
            return

        logger.info("Generated %d chunks from '%s'.", len(chunks), file_name)

        # 3. Generate embeddings
        embeddings = await _generate_embeddings(chunks)

        # 4. Store vectors
        vectors = [
            {
                "organization_id": org_id,
                "file_id": file_id,
                "content": chunk,
                "embedding": embedding,
                "chunk_index": idx,
            }
            for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]
        await supabase_svc.insert_knowledge_vectors(vectors)

        # 5. Update status
        await supabase_svc.update_knowledge_file_status(file_id, "ready", len(chunks))
        logger.info("PDF '%s' processed successfully: %d chunks stored.", file_name, len(chunks))

    except Exception:
        logger.exception("Failed to process PDF '%s' (file_id=%s).", file_name, file_id)
        try:
            await supabase_svc.update_knowledge_file_status(file_id, "error", 0)
        except Exception:
            logger.warning("Could not update file status to error for %s.", file_id)


async def search_knowledge(
    org_id: str,
    query: str,
    top_k: int = 5,
) -> str:
    """
    Search the knowledge base for relevant context.

    Returns a formatted string of relevant chunks, or empty string if none found.
    """
    try:
        settings = get_settings()
        client = AsyncOpenAI(api_key=settings.openai_api_key)

        # Generate query embedding
        response = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=[query],
        )
        query_embedding = response.data[0].embedding

        # Search vectors
        results = await supabase_svc.match_knowledge_vectors(
            embedding=query_embedding,
            org_id=org_id,
            top_k=top_k,
        )

        if not results:
            return ""

        # Format results as context string
        context_parts = []
        for r in results:
            similarity = r.get("similarity", 0)
            if similarity > 0.3:  # only include reasonably similar chunks
                context_parts.append(r["content"])

        if not context_parts:
            return ""

        return "\n---\n".join(context_parts)

    except Exception:
        logger.exception("Knowledge search failed for org=%s.", org_id)
        return ""
