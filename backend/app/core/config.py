from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "FinPilot AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    GROQ_API_KEY: str = ""

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/finpilot"

    # Private directory for uploaded source documents (never served publicly).
    STORAGE_DIR: str = "storage"
    # Maximum accepted PDF upload size, in megabytes.
    MAX_PDF_SIZE_MB: int = 10
    # Maximum number of pages accepted from a single PDF.
    MAX_PDF_PAGES: int = 500

    class Config:
        env_file = ".env"


settings = Settings()
