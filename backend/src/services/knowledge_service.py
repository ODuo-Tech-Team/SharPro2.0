"""
SharkPro V2 - Knowledge Service (Simple text extraction)

Extracts text from uploaded PDFs. The extracted text is stored directly
in knowledge_files.content and appended to the AI system prompt.
"""

from __future__ import annotations
import logging

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_bytes: bytes) -> str:
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
