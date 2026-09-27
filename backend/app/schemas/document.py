from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class DocumentBase(BaseModel):
    title: str
    category: str = "General"
    source_file: str

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
    created_at: datetime
    chunks: Optional[List[DocumentChunkResponse]] = None

    model_config = ConfigDict(from_attributes=True)
