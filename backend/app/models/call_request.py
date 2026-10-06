import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.db.session import Base

class CallRequest(Base):
    __tablename__ = "call_requests"

    id = Column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    phone_number = Column(String(32), nullable=False)
    assigned_line_id = Column(String(32), nullable=False)  # line_1, line_2, line_3
    assigned_agent_name = Column(String(128), nullable=False)
    assigned_phone_number = Column(String(32), nullable=False)
    topic = Column(String(256), nullable=False, default="Unresolved onboarding issue")
    notes = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="initiated")  # initiated, connected, completed, missed
    call_type = Column(String(32), nullable=False, default="callback")  # direct_dial, callback, in_browser_simulation
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="call_requests")
