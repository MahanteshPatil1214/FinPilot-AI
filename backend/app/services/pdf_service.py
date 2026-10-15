from typing import Any, Dict, List

# A text-based PDF must yield at least this many non-whitespace characters
# across all pages; below this we treat it as a scanned/image-only document.
MIN_EXTRACTABLE_CHARS = 20


class PDFValidationError(Exception):
    """Raised when a PDF fails validation or cannot be processed."""

    def __init__(self, message: str, code: str = "invalid_pdf"):
        super().__init__(message)
        self.message = message
        self.code = code


def has_pdf_signature(content: bytes) -> bool:
    # The PDF header must appear within the first 1024 bytes per the spec.
    return content[:1024].find(b"%PDF-") != -1


def validate_pdf(content: bytes) -> None:
    if not content:
        raise PDFValidationError("PDF file is empty", code="empty")
    if not has_pdf_signature(content):
        raise PDFValidationError("File is not a valid PDF (missing %PDF- signature)", code="bad_signature")


def extract_pdf_pages(content: bytes, max_pages: int) -> Dict[str, Any]:
    """Extract text per page while preserving page numbers.

    Raises PDFValidationError for malformed, encrypted, empty, or
    scanned/image-only PDFs. OCR is not implemented.
    """
    validate_pdf(content)

    try:
        import pymupdf as fitz  # type: ignore
    except ImportError:  # pragma: no cover
        raise PDFValidationError("PDF support is unavailable", code="no_pymupdf")

    try:
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception:
        raise PDFValidationError("PDF is malformed or unreadable", code="malformed")

    try:
        if doc.is_encrypted or doc.needs_pass:
            raise PDFValidationError(
                "Encrypted or password-protected PDFs are not supported",
                code="encrypted",
            )

        page_count = doc.page_count
        if page_count == 0:
            raise PDFValidationError("PDF contains no pages", code="empty")
        if page_count > max_pages:
            raise PDFValidationError(
                f"PDF has too many pages ({page_count}); limit is {max_pages}",
                code="too_many_pages",
            )

        pages: List[Dict[str, Any]] = []
        total_chars = 0
        for index in range(page_count):
            try:
                page = doc.load_page(index)
                text = page.get_text("text") or ""
            except Exception:
                text = ""
            stripped = text.strip()
            total_chars += len(stripped)
            pages.append(
                {
                    "page_number": index + 1,
                    "content": stripped,
                    "char_count": len(stripped),
                }
            )

        if total_chars < MIN_EXTRACTABLE_CHARS:
            raise PDFValidationError(
                "No extractable text found; scanned/image-only PDFs are not "
                "supported (OCR is not implemented)",
                code="no_text",
            )

        return {"pages": pages, "page_count": page_count}
    finally:
        doc.close()
