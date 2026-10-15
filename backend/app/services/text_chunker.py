"""Deterministic, page-aware text chunking.

No model, no randomness: the same page text always yields the same chunks. The
chunker keeps a configurable overlap so a sentence split across a boundary is
still retrievable, and it never renumbers or rewrites content.
"""

import re
from typing import Dict, List

# Natural boundaries we prefer to split at, most desirable first.
_BOUNDARIES = ("\n\n", "\n", ". ", "; ", ", ", " ")


def clean_extracted_text(text: str) -> str:
    """Remove obvious extraction noise without touching numbers or wording."""
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u00a0", " ").replace("\ufeff", "")
    # Collapse trailing spaces and runs of 3+ blank lines.
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_text(text: str, chunk_size: int, overlap: int) -> List[str]:
    """Split one string into overlapping chunks of roughly ``chunk_size`` chars."""
    text = text.strip()
    if not text:
        return []
    if chunk_size <= 0:
        chunk_size = 800
    overlap = max(0, min(overlap, chunk_size - 1))

    chunks: List[str] = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + chunk_size, length)
        if end < length:
            # Look for a natural boundary in the back half of the window.
            search_from = start + max(1, chunk_size // 2)
            for boundary in _BOUNDARIES:
                index = text.rfind(boundary, search_from, end)
                if index != -1:
                    end = index + len(boundary)
                    break
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= length:
            break
        # Guarantee forward progress even when overlap is large.
        start = max(end - overlap, start + 1)
    return chunks


def chunk_pages(
    pages: List[Dict], chunk_size: int, overlap: int
) -> List[Dict]:
    """Turn page records into chunks carrying their page number.

    Each input page is ``{"page_number": int, "content": str}``. Output chunks
    are ``{"page_number": int, "content": str, "chunk_index": int}`` with a
    single continuous ``chunk_index`` across the whole document. Empty pages are
    skipped so citations never point at a blank page.
    """
    chunks: List[Dict] = []
    index = 0
    for page in pages:
        page_number = page.get("page_number")
        content = clean_extracted_text(page.get("content") or "")
        for piece in split_text(content, chunk_size, overlap):
            chunks.append(
                {
                    "page_number": page_number,
                    "content": piece,
                    "chunk_index": index,
                }
            )
            index += 1
    return chunks
