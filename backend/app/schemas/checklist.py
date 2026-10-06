from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class ChecklistTemplateBase(BaseModel):
    role: str = "All"
    location: str = "All"
    department: str = "All"
    template_type: str = "role"  # base, role, location
    title: str
    description: Optional[str] = None
    category: str = "General"
    due_days_from_hire: int = 3
    required: bool = True
    mandatory: bool = True
    priority: str = "medium"  # high, medium, low, urgent
    reference_doc: Optional[str] = None

class ChecklistTemplateCreate(ChecklistTemplateBase):
    pass

class ChecklistTemplateResponse(ChecklistTemplateBase):
    id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
