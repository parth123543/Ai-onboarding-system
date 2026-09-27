import os
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="allow")
    PROJECT_NAME: str = "Microsoft Innovate 2026 - AI Onboarding Assistant (PS15)"
    API_V1_STR: str = "/api/v1"
    
    # Environment & Security
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "microsoft-innovate-2026-hackathon-super-secret-key-ps15-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./onboarding.db"
    )
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Azure OpenAI Service API
    AZURE_OPENAI_API_KEY: Optional[str] = os.getenv("AZURE_OPENAI_API_KEY", None)
    AZURE_OPENAI_ENDPOINT: Optional[str] = os.getenv("AZURE_OPENAI_ENDPOINT", None)
    AZURE_OPENAI_API_VERSION: str = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
    AZURE_OPENAI_CHAT_DEPLOYMENT: str = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4o")
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: str = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small")
    
    # Standard OpenAI Fallback (if Azure keys not present)
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY", None)
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    OPENAI_EMBEDDING_MODEL: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    
    # Slack Integration
    SLACK_WEBHOOK_URL: Optional[str] = os.getenv("SLACK_WEBHOOK_URL", None)
    SLACK_BOT_TOKEN: Optional[str] = os.getenv("SLACK_BOT_TOKEN", None)
    
    # Email / SendGrid Integration
    SENDGRID_API_KEY: Optional[str] = os.getenv("SENDGRID_API_KEY", None)
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "onboarding@contoso.microsoft.com")
    
    # Microsoft Bot Framework / Teams
    MICROSOFT_APP_ID: Optional[str] = os.getenv("MICROSOFT_APP_ID", None)
    MICROSOFT_APP_PASSWORD: Optional[str] = os.getenv("MICROSOFT_APP_PASSWORD", None)

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "*"]
    
    # Router & RAG Thresholds
    CONFIDENCE_THRESHOLD: float = 0.70
    TOP_K_CHUNKS: int = 4
    SIMILARITY_THRESHOLD: float = 0.25

settings = Settings()
