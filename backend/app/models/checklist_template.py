import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime
from app.db.session import Base

def generate_uuid() -> str:
    return uuid.uuid4().hex

class ChecklistTemplate(Base):
    __tablename__ = "checklist_templates"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    # Role matching (e.g. "Software Engineer", "Product Manager", or "All")
    role = Column(String(100), nullable=False, default="All", index=True)
    # Location matching (e.g. "Redmond, WA", "London, UK", or "All")
    location = Column(String(100), nullable=False, default="All", index=True)
    department = Column(String(100), nullable=False, default="All")
    template_type = Column(String(50), nullable=False, default="role", index=True)  # base, role, location
    title = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    category = Column(String(50), nullable=False, default="General")  # IT, HR, Legal, Training, Team
    due_days_from_hire = Column(Integer, nullable=False, default=3)
    required = Column(Boolean, default=True, nullable=False)
    mandatory = Column(Boolean, default=True, nullable=False)
    priority = Column(String(20), default="medium", nullable=False)  # high, medium, low, urgent
    reference_doc = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
