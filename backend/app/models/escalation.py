import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.db.session import Base

def generate_uuid() -> str:
    return uuid.uuid4().hex

class Escalation(Base):
    __tablename__ = "escalations"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(String(64), nullable=True)
    reason = Column(String(255), nullable=False)  # sensitive_topic, low_confidence, user_requested
    status = Column(String(20), nullable=False, default="open", index=True)  # open, in_review, resolved
    priority = Column(String(20), nullable=False, default="high")  # urgent, high, medium
    summary = Column(Text, nullable=False)
    context_messages = Column(JSON, nullable=True)  # snapshot of recent chat turns
    hr_assigned_to = Column(String(255), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="escalations")
