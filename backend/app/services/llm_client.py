"""Answer-generation LLM client.

The real client calls Groq. The import and the API key check are deferred until
an answer is actually requested, so retrieval and indexing work with no API key
configured and tests can inject a fake client via dependency override.
"""

import logging
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMUnavailable(Exception):
    """Raised when answer generation cannot run (missing key/SDK)."""


class LLMClient(Protocol):
    def answer(self, system_prompt: str, user_prompt: str) -> str:
        ...


class GroqLLMClient:
    def __init__(self, model_name: str = None, api_key: str = None):
        self.model_name = model_name or settings.GROQ_MODEL_NAME
        self.api_key = api_key if api_key is not None else settings.GROQ_API_KEY

    def answer(self, system_prompt: str, user_prompt: str) -> str:
        if not self.api_key:
            raise LLMUnavailable("GROQ_API_KEY is not configured")
        try:
            from groq import Groq  # lazy import
        except ImportError as exc:  # pragma: no cover - dependency is pinned
            raise LLMUnavailable("groq client is not installed") from exc

        client = Groq(api_key=self.api_key)
        response = client.chat.completions.create(
            model=self.model_name,
            temperature=0,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.choices[0].message.content or ""


def get_llm_client() -> LLMClient:
    """FastAPI dependency: default Groq-backed client."""
    return GroqLLMClient()
