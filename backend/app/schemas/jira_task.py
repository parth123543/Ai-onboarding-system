"""
Pydantic Schemas for Jira-Grade Task Engine
"""
from typing import List, Optional, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field

# --- Labels ---
class JiraLabelBase(BaseModel):
    name: str
    color: str = "#6366f1"

class JiraLabelRead(JiraLabelBase):
    id: str
    class Config:
        from_attributes = True

# --- Subtasks ---
class JiraSubTaskBase(BaseModel):
    title: str
    is_done: bool = False
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None

class JiraSubTaskCreate(JiraSubTaskBase):
    parent_task_id: str

class JiraSubTaskRead(JiraSubTaskBase):
    id: str
    parent_task_id: str
    sort_order: int
    created_at: Optional[datetime]
    class Config:
        from_attributes = True

# --- Comments ---
class JiraCommentCreate(BaseModel):
    body: str
    mentions: Optional[List[str]] = None

class JiraCommentRead(BaseModel):
    id: str
    task_id: str
    author_id: Optional[str]
    author_name: Optional[str] = "Colleague"
    body: str
    mentions: Optional[List[str]] = None
    created_at: Optional[datetime]
    class Config:
        from_attributes = True

# --- Work Logs ---
class JiraWorkLogCreate(BaseModel):
    hours: float
    description: Optional[str] = None

class JiraWorkLogRead(BaseModel):
    id: str
    task_id: str
    user_id: Optional[str]
    hours: float
    description: Optional[str] = None
    logged_at: Optional[datetime]
    class Config:
        from_attributes = True

# --- Core Task ---
class JiraTaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    type: str = "task"  # task | bug | story | epic
    status: str = "todo"  # todo | in_progress | in_review | done | blocked
    priority: str = "medium"  # urgent | high | medium | low
    assignee_id: Optional[str] = None
    reporter_id: Optional[str] = None
    due_date: Optional[datetime] = None
    sla_hours: Optional[int] = None
    story_points: Optional[int] = None
    category: Optional[str] = "General"
    onboarding_day: Optional[int] = 1

class JiraTaskCreate(JiraTaskBase):
    labels: Optional[List[str]] = []

class JiraTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None
    story_points: Optional[int] = None
    time_spent_hours: Optional[float] = None

class JiraTaskRead(JiraTaskBase):
    id: str
    key: Optional[str]
    completed_at: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    time_spent_hours: Optional[float] = 0.0
    labels: List[JiraLabelRead] = []
    subtasks: List[JiraSubTaskRead] = []
    comments_count: Optional[int] = 0
    assignee_name: Optional[str] = None
    reporter_name: Optional[str] = None
    class Config:
        from_attributes = True
