from typing import List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The development default. Used to refuse to boot with it in production.
_DEV_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/finpilot"

# Identity providers the API can resolve a principal from.
_VALID_AUTH_PROVIDERS = ("development", "header", "jwt")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    PROJECT_NAME: str = "FinPilot AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # deployment | test | production. Anything else falls back to development.
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    GROQ_API_KEY: str = ""

    DATABASE_URL: str = _DEV_DATABASE_URL

    # Private directory for uploaded source documents (never served publicly).
    STORAGE_DIR: str = "storage"
    # Maximum accepted PDF upload size, in megabytes.
    MAX_PDF_SIZE_MB: int = 10
    # Maximum number of pages accepted from a single PDF.
    MAX_PDF_PAGES: int = 500

    # Days either side of an invoice's date range within which a bank
    # transaction date still counts as an in-window match.
    RECONCILIATION_DATE_WINDOW_DAYS: int = 30

    # --- Retrieval-Augmented Generation (evidence search over documents) ---
    # Local embedding model; vectors must match the pgvector column width.
    EMBEDDING_MODEL_NAME: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384
    EMBEDDING_BATCH_SIZE: int = 32

    # Chunking controls (character based).
    RAG_CHUNK_SIZE: int = 800
    RAG_CHUNK_OVERLAP: int = 100

    # Retrieval controls.
    RAG_TOP_K: int = 5
    # Minimum cosine similarity for a chunk to count as usable evidence.
    # Below this the system must answer "insufficient evidence" instead of
    # guessing.
    RAG_MIN_SCORE: float = 0.35

    # Answer-generation model (retrieval works without it). Groq retired the
    # llama-3.1 family for this API; gpt-oss-20b is a currently served, fast
    # chat model. Override with GROQ_MODEL_NAME if your account differs.
    GROQ_MODEL_NAME: str = "openai/gpt-oss-20b"
    # Bound every model call so a slow provider can never hang a request.
    GROQ_TIMEOUT_SECONDS: float = 30.0
    # Transient transport retries. 1 means at most two attempts per call.
    GROQ_MAX_RETRIES: int = 1

    # --- Assistant orchestration ---
    # Hard wall-clock budget for one chat turn, and the maximum number of
    # allowlisted tools a single turn may execute. Both prevent runaway loops.
    CHAT_TURN_TIMEOUT_SECONDS: float = 20.0
    CHAT_MAX_TOOL_CALLS: int = 4

    # --- Identity / authentication boundary ---
    # development: fixed local identity (never a security boundary).
    # header: trust X-User-Id / X-Organization-Id from a trusted proxy. Dev/test only.
    # jwt: verify a bearer HS256 JWT and map its claims to a principal.
    AUTH_PROVIDER: str = "development"
    AUTH_JWT_SECRET: str = ""
    AUTH_JWT_ALGORITHM: str = "HS256"
    # The JWT claim carrying the organization id.
    AUTH_JWT_ORG_CLAIM: str = "org"

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def _normalize_environment(cls, value: object) -> str:
        return str(value or "development").strip().lower()

    @field_validator("AUTH_PROVIDER", mode="before")
    @classmethod
    def _normalize_auth_provider(cls, value: object) -> str:
        provider = str(value or "development").strip().lower()
        if provider not in _VALID_AUTH_PROVIDERS:
            raise ValueError(
                "AUTH_PROVIDER must be one of "
                f"{', '.join(_VALID_AUTH_PROVIDERS)}"
            )
        return provider

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def _normalize_log_level(cls, value: object) -> str:
        return str(value or "INFO").strip().upper()

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def _validate_production_invariants(self) -> "Settings":
        """Fail fast on unsafe configuration, but only in production.

        Development and test must stay frictionless; production must not run
        with a wildcard CORS policy (incompatible with credentialed requests)
        or the committed development database URL.
        """
        if not self.is_production:
            return self

        if self.ALLOWED_ORIGINS and "*" in self.ALLOWED_ORIGINS:
            raise ValueError(
                "ALLOWED_ORIGINS must not contain '*' in production while "
                "credentials are allowed"
            )
        if self.DATABASE_URL == _DEV_DATABASE_URL:
            raise ValueError(
                "DATABASE_URL must be configured explicitly in production"
            )
        if self.AUTH_PROVIDER == "header":
            raise ValueError(
                "AUTH_PROVIDER='header' trusts client-supplied headers and is "
                "not allowed in production"
            )
        if self.AUTH_PROVIDER == "jwt" and not self.AUTH_JWT_SECRET:
            raise ValueError("AUTH_JWT_SECRET is required when AUTH_PROVIDER='jwt'")
        return self


settings = Settings()
