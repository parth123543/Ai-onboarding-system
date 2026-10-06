"""
Chat and communication models for the enterprise chat system.
Includes Channels, ChannelMessage, DirectMessage, Announcement, and MessageAttachment.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    DateTime,
    Text,
    Boolean,
    ForeignKey,
    JSON,
    Integer,
)
from sqlalchemy.orm import relationship
from app.db.session import Base


def gen_uuid() -> str:
    return uuid.uuid4().hex


class Channel(Base):
    __tablename__ = "chat_channels"
    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    name = Column(String(120), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_announcement = Column(Boolean, default=False)  # true for #announcements channel
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    # Relationships
    messages = relationship("ChannelMessage", back_populates="channel", cascade="all, delete-orphan")
    # Optional role‑based posting restriction can be added later


class ChannelMessage(Base):
    __tablename__ = "chat_channel_messages"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    channel_id = Column(String(36), ForeignKey("chat_channels.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)  # markdown / plain text
    extra_meta = Column(JSON, nullable=True)  # e.g., {"type": "bot", "intent": "faq"}
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # Relationships
    channel = relationship("Channel", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])
    attachments = relationship("MessageAttachment", back_populates="channel_message", cascade="all, delete-orphan")


class DirectMessage(Base):
    __tablename__ = "chat_direct_messages"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    recipient_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # Relationships
    sender = relationship("User", foreign_keys=[sender_id], backref="sent_direct_messages")
    recipient = relationship("User", foreign_keys=[recipient_id], backref="received_direct_messages")
    attachments = relationship("MessageAttachment", back_populates="direct_message", cascade="all, delete-orphan")


class Announcement(Base):
    __tablename__ = "chat_announcements"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    creator_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    read_by = Column(JSON, nullable=True)  # list of user IDs that have read
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # Relationships
    creator = relationship("User", foreign_keys=[creator_id])


class MessageAttachment(Base):
    __tablename__ = "chat_message_attachments"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    filename = Column(String(255), nullable=False)
    url = Column(String(1024), nullable=False)  # Supabase Storage URL
    mime_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    # Polymorphic link – either a channel message or a direct message
    channel_message_id = Column(String(36), ForeignKey("chat_channel_messages.id", ondelete="CASCADE"), nullable=True)
    direct_message_id = Column(String(36), ForeignKey("chat_direct_messages.id", ondelete="CASCADE"), nullable=True)
    # Relationships
    channel_message = relationship("ChannelMessage", back_populates="attachments")
    direct_message = relationship("DirectMessage", back_populates="attachments")
