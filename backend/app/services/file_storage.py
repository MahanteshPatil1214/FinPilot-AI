import os
import re
import tempfile
from pathlib import Path

_UNSAFE_CHARS = re.compile(r"[^A-Za-z0-9._ -]")
_PATH_SEPARATORS = re.compile(r"[\\/]+")


def sanitize_filename(filename: str, max_length: int = 255) -> str:
    """Return a safe, display-only filename.

    Strips any directory components and control/unsafe characters. The result
    is only used as metadata and never as a filesystem path.
    """
    if not filename:
        return "document.pdf"

    name = filename.replace("\\", "/").split("/")[-1]
    name = _PATH_SEPARATORS.sub("_", name)
    name = _UNSAFE_CHARS.sub("_", name).strip(" .")
    name = name.replace("..", "_")

    if not name:
        name = "document.pdf"

    if len(name) > max_length:
        stem, ext = os.path.splitext(name)
        keep = max_length - len(ext)
        name = stem[:keep] + ext

    return name


def _documents_dir(storage_dir: str) -> Path:
    base = Path(storage_dir)
    if not base.is_absolute():
        base = Path.cwd() / base
    path = base / "documents"
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_pdf(content: bytes, document_id: str, storage_dir: str) -> str:
    """Atomically store a PDF and return its storage path.

    The filename is always server-generated from the document id; no part of
    the user-supplied filename is used on disk.
    """
    directory = _documents_dir(storage_dir)
    final_path = directory / f"{document_id}.pdf"

    fd, tmp_name = tempfile.mkstemp(dir=str(directory), suffix=".part")
    try:
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(content)
        os.replace(tmp_name, final_path)
    except Exception:
        try:
            os.remove(tmp_name)
        except OSError:
            pass
        raise
    return str(final_path)


def delete_file(storage_path: str) -> None:
    if not storage_path:
        return
    try:
        os.remove(storage_path)
    except OSError:
        pass
