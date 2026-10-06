from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class DocumentBase(BaseModel):
    title: str
    category: str = "General"
    source_file: str
    organization_id: Optional[str] = "launchmate"

class DocumentCreate(DocumentBase):
    content: str

class DocumentChunkResponse(BaseModel):
    id: str
    chunk_index: int
    section_title: Optional[str] = None
    content: str

    model_config = ConfigDict(from_attributes=True)

class DocumentResponse(DocumentBase):
    id: str
    organization_id: str = "launchmate"
    content_hash: Optional[str] = None
    status: str = "Successfully Indexed"
    file_type: Optional[str] = "text"
    file_size: Optional[int] = 0
    chunk_count: Optional[int] = 0
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    chunks: Optional[List[DocumentChunkResponse]] = None

    model_config = ConfigDict(from_attributes=True)

