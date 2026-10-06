import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer, JSON
from sqlalchemy.orm import relationship
from app.db.session import Base

def generate_uuid() -> str:
    return uuid.uuid4().hex

class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    organization_id = Column(String(50), nullable=False, default="launchmate", index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False, default="General")  # HR, IT, Benefits, Security, Handbook, Compliance
    source_file = Column(String(255), nullable=False)
    content_hash = Column(String(64), nullable=True, index=True)
    status = Column(String(30), nullable=False, default="Successfully Indexed")  # Processing, Successfully Indexed, Failed, Duplicate
    file_type = Column(String(20), nullable=True, default="text")
    file_size = Column(Integer, nullable=True, default=0)
    chunk_count = Column(Integer, nullable=True, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    section_title = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    embedding = Column(JSON, nullable=True)  # List[float] vector serialized as JSON
    metadata_json = Column(JSON, nullable=True)

    document = relationship("Document", back_populates="chunks")
