from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class Citation(BaseModel):
    title: str
    section: Optional[str] = None
    source_file: Optional[str] = None
    snippet: str
    score: float

class AgentRouterDecision(BaseModel):
    category: str  # knowledge_query, task_action, escalate
    confidence: float
    reasoning: str
    detected_action: Optional[str] = None  # e.g., "complete_task", "raise_it_ticket", "book_orientation"
    action_parameters: Optional[Dict[str, Any]] = None
    is_sensitive: bool = False
    sensitivity_reason: Optional[str] = None

class ChatMessageCreate(BaseModel):
    content: str
    conversation_id: str = "default"

class ChatResponse(BaseModel):
    id: str
    conversation_id: str
    sender: str
    content: str
    category: Optional[str] = None
    confidence: Optional[float] = None
    citations: Optional[List[Citation]] = None
    agent_action: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Microsoft Teams / Bot Framework Activity Schema
class TeamsChannelAccount(BaseModel):
    id: str
    name: Optional[str] = None

class TeamsConversationAccount(BaseModel):
    id: str
    isGroup: Optional[bool] = False
    name: Optional[str] = None

class TeamsActivity(BaseModel):
    type: str = "message"
    id: Optional[str] = None
    timestamp: Optional[str] = None
    channelId: Optional[str] = "msteams"
    serviceUrl: Optional[str] = None
    from_: Optional[TeamsChannelAccount] = Field(None, alias="from")
    conversation: Optional[TeamsConversationAccount] = None
    recipient: Optional[TeamsChannelAccount] = None
    textFormat: Optional[str] = "markdown"
    text: Optional[str] = ""

    model_config = ConfigDict(populate_by_name=True)
