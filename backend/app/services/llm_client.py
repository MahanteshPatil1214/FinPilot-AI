"""Answer-generation LLM client.

The real client calls Groq. The import and the API key check are deferred until
an answer is actually requested, so retrieval and indexing work with no API key
configured and tests can inject a fake client via dependency override.

Calls are bounded: a per-request timeout and a small, fixed number of retries on
transient transport errors. The client never retries on a missing key or SDK.
"""

import logging
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMUnavailable(Exception):
    """Raised when answer generation cannot run (missing key/SDK)."""


class LLMError(Exception):
    """Raised when the provider fails after the bounded retries are exhausted."""


class LLMClient(Protocol):
    def answer(self, system_prompt: str, user_prompt: str) -> str:
        ...


class GroqLLMClient:
    def __init__(
        self,
        model_name: str = None,
        api_key: str = None,
        timeout: float = None,
        max_retries: int = None,
    ):
        self.model_name = model_name or settings.GROQ_MODEL_NAME
        self.api_key = api_key if api_key is not None else settings.GROQ_API_KEY
        self.timeout = (
            timeout if timeout is not None else settings.GROQ_TIMEOUT_SECONDS
        )
        self.max_retries = (
            max_retries if max_retries is not None else settings.GROQ_MAX_RETRIES
        )

    def answer(self, system_prompt: str, user_prompt: str) -> str:
        if not self.api_key:
            raise LLMUnavailable("GROQ_API_KEY is not configured")
        try:
            from groq import Groq  # lazy import
        except ImportError as exc:  # pragma: no cover - dependency is pinned
            raise LLMUnavailable("groq client is not installed") from exc

        client = Groq(api_key=self.api_key, timeout=self.timeout)
        attempts = max(0, self.max_retries) + 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                response = client.chat.completions.create(
                    model=self.model_name,
                    temperature=0,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                )
                return response.choices[0].message.content or ""
            except Exception as exc:  # transport/provider failure
                last_error = exc
                logger.warning(
                    "Groq answer attempt %d/%d failed (error: %s)",
                    attempt + 1,
                    attempts,
                    type(exc).__name__,
                )
        raise LLMError(f"LLM request failed: {type(last_error).__name__}")


def get_llm_client() -> LLMClient:
    """FastAPI dependency: default Groq-backed client."""
    return GroqLLMClient()
