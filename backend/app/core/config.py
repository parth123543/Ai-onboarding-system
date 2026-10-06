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
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "onboarding@launchmate.microsoft.com")
    
    # Microsoft Graph / Teams Integration (Delegated OAuth)
    MICROSOFT_TENANT_ID: Optional[str] = os.getenv("MICROSOFT_TENANT_ID", "2c5bdaf4-8ff2-4bd9-bd54-7c50ab219590")
    MICROSOFT_CLIENT_ID: Optional[str] = os.getenv("MICROSOFT_CLIENT_ID", "0a2a8f7a-7986-4c8d-8a5d-205fcb20478b")
    MICROSOFT_CLIENT_SECRET: Optional[str] = os.getenv("MICROSOFT_CLIENT_SECRET", "f1e473c6-7906-431b-95c6-616b57bc9043")
    MICROSOFT_REDIRECT_URI: str = os.getenv("MICROSOFT_REDIRECT_URI", "http://localhost:3000/api/auth/teams/callback")
    MICROSOFT_APP_ID: Optional[str] = os.getenv("MICROSOFT_APP_ID", None)
    MICROSOFT_APP_PASSWORD: Optional[str] = os.getenv("MICROSOFT_APP_PASSWORD", None)

    # Live Agent Phone Lines (Dedicated Lines with Dynamic Assignment)
    SUPPORT_PHONE_1: str = os.getenv("SUPPORT_PHONE_1", "+91 9772835979")
    SUPPORT_PHONE_2: str = os.getenv("SUPPORT_PHONE_2", "+91 8529782946")
    SUPPORT_PHONE_3: str = os.getenv("SUPPORT_PHONE_3", "+91 9772835979")

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "*"]
    
    # Router & RAG Thresholds
    CONFIDENCE_THRESHOLD: float = 0.70
    TOP_K_CHUNKS: int = 4
    SIMILARITY_THRESHOLD: float = 0.42

settings = Settings()
