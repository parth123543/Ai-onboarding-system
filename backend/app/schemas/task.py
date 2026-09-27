from datetime import datetime
from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "General"
    priority: str = "medium"
    due_date: Optional[datetime] = None

class TaskCreate(TaskBase):
    user_id: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None

class TaskStatusUpdate(BaseModel):
    status: str  # pending, in_progress, completed, overdue

class TaskResponse(TaskBase):
    id: str
    user_id: str
    status: str
    completed_at: Optional[datetime] = None
    metadata_json: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TaskStatsResponse(BaseModel):
    total_tasks: int
    completed_tasks: int
    pending_tasks: int
    overdue_tasks: int
    completion_percentage: float
