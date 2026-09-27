import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Float, JSON
from sqlalchemy.orm import relationship
from app.db.session import Base

def generate_uuid() -> str:
    return uuid.uuid4().hex

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(String(64), nullable=False, default="default", index=True)
    sender = Column(String(20), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    category = Column(String(50), nullable=True)  # knowledge_query, task_action, escalate
    confidence = Column(Float, nullable=True)
    citations = Column(JSON, nullable=True)  # list of {title, section, snippet, score}
    agent_action = Column(JSON, nullable=True)  # {tool, params, result}
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    user = relationship("User", back_populates="chat_messages")
