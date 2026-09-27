from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class ChecklistTemplateBase(BaseModel):
    role: str = "All"
    location: str = "All"
    department: str = "All"
    title: str
    description: Optional[str] = None
    category: str = "General"
    due_days_from_hire: int = 3
    required: bool = True
    priority: str = "medium"

class ChecklistTemplateCreate(ChecklistTemplateBase):
    pass

class ChecklistTemplateResponse(ChecklistTemplateBase):
    id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
