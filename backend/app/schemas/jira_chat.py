"""
Pydantic schemas for the enterprise chat system.
"""
from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field

class ChannelBase(BaseModel):
    name: str = Field(..., max_length=120)
    description: Optional[str] = None
    is_announcement: bool = False

class ChannelCreate(ChannelBase):
    pass

class ChannelRead(ChannelBase):
    id: str
    created_at: datetime
    updated_at: datetime
    class Config:
        orm_mode = True

class MessageAttachmentBase(BaseModel):
    filename: str
    url: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None

class ChannelMessageBase(BaseModel):
    channel_id: str
    content: str
    metadata: Optional[dict] = None

class ChannelMessageCreate(ChannelMessageBase):
    attachments: Optional[List[MessageAttachmentBase]] = None

class ChannelMessageRead(ChannelMessageBase):
    id: str
    sender_id: Optional[str]
    created_at: datetime
    attachments: List[MessageAttachmentBase] = []
    class Config:
        orm_mode = True

class DirectMessageBase(BaseModel):
    recipient_id: str
    content: str

class DirectMessageCreate(DirectMessageBase):
    attachments: Optional[List[MessageAttachmentBase]] = None

class DirectMessageRead(DirectMessageBase):
    id: str
    sender_id: Optional[str]
    created_at: datetime
    attachments: List[MessageAttachmentBase] = []
    class Config:
        orm_mode = True

class AnnouncementBase(BaseModel):
    title: str
    body: str

class AnnouncementCreate(AnnouncementBase):
    pass

class AnnouncementRead(AnnouncementBase):
    id: str
    creator_id: Optional[str]
    created_at: datetime
    read_by: Optional[List[str]] = []
    class Config:
        orm_mode = True
