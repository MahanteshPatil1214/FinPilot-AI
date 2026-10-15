"""Local embedding provider.

The real provider uses ``sentence-transformers`` and is imported lazily so that
tests (which inject a deterministic fake via dependency override) never need the
model, the weights download, or a GPU. Production uses the spec's
``sentence-transformers/all-MiniLM-L6-v2`` (384 dimensions).
"""

import logging
from typing import List, Protocol, Sequence

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingProvider(Protocol):
    dim: int

    def embed_documents(self, texts: Sequence[str]) -> List[List[float]]:
        ...

    def embed_query(self, text: str) -> List[float]:
        ...


class SentenceTransformerEmbeddingProvider:
    """Lazy wrapper around a local Sentence Transformer model."""

    def __init__(self, model_name: str = None, dim: int = None):
        self.model_name = model_name or settings.EMBEDDING_MODEL_NAME
        self.dim = dim or settings.EMBEDDING_DIM
        self._model = None

    def _load(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer  # lazy import

            logger.info("Loading embedding model %s", self.model_name)
            self._model = SentenceTransformer(self.model_name)
        return self._model

    def embed_documents(self, texts: Sequence[str]) -> List[List[float]]:
        texts = list(texts)
        if not texts:
            return []
        model = self._load()
        vectors = model.encode(
            texts,
            batch_size=settings.EMBEDDING_BATCH_SIZE,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return [list(map(float, vector)) for vector in vectors]

    def embed_query(self, text: str) -> List[float]:
        return self.embed_documents([text])[0]


_provider: EmbeddingProvider = None


def get_embedding_provider() -> EmbeddingProvider:
    """FastAPI dependency: shared provider instance, created on first use."""
    global _provider
    if _provider is None:
        _provider = SentenceTransformerEmbeddingProvider()
    return _provider
