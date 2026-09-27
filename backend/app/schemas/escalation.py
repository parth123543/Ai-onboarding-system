from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict

class EscalationBase(BaseModel):
    reason: str
    priority: str = "high"
    summary: str

class EscalationCreate(EscalationBase):
    user_id: Optional[str] = None
    conversation_id: Optional[str] = None
    context_messages: Optional[List[Dict[str, Any]]] = None

class EscalationUpdate(BaseModel):
    status: Optional[str] = None  # open, in_review, resolved
    priority: Optional[str] = None
    hr_assigned_to: Optional[str] = None
    resolution_notes: Optional[str] = None

class EscalationResponse(EscalationBase):
    id: str
    user_id: str
    conversation_id: Optional[str] = None
    status: str
    context_messages: Optional[List[Dict[str, Any]]] = None
    hr_assigned_to: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
