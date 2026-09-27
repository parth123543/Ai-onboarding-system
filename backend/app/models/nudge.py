import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from app.db.session import Base

def generate_uuid() -> str:
    return uuid.uuid4().hex

class NudgeRecord(Base):
    __tablename__ = "nudge_records"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    channel = Column(String(20), nullable=False, default="slack")  # slack, email
    message = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="sent")  # sent, simulated, failed
    sent_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
