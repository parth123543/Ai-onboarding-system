"""
Enterprise Chat API: Channels, Announcements, Direct Messages, and Teams Live Sync
"""
import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.jira_chat import (
    Channel,
    ChannelMessage,
    DirectMessage,
    Announcement,
)
from app.models.user import User
from app.schemas.jira_chat import (
    ChannelCreate,
    ChannelRead,
    ChannelMessageCreate,
    ChannelMessageRead,
    DirectMessageCreate,
    DirectMessageRead,
    AnnouncementCreate,
    AnnouncementRead,
)

from app.services.email_service import email_service

logger = logging.getLogger("enterprise_chat_api")
router = APIRouter()

# --- Channels ---
@router.get("/channels", response_model=List[ChannelRead])
async def list_channels(db: AsyncSession = Depends(get_db)):
    stmt = select(Channel).order_by(Channel.created_at.asc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/channels", response_model=ChannelRead, status_code=status.HTTP_201_CREATED)
async def create_channel(payload: ChannelCreate, db: AsyncSession = Depends(get_db)):
    ch = Channel(
        name=payload.name,
        description=payload.description,
        is_announcement=payload.is_announcement,
    )
    db.add(ch)
    await db.commit()
    await db.refresh(ch)
    return ch

@router.get("/channels/{channel_id}/messages", response_model=List[ChannelMessageRead])
async def get_channel_messages(
    channel_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ChannelMessage)
        .options(selectinload(ChannelMessage.sender))
        .where(ChannelMessage.channel_id == channel_id)
        .order_by(ChannelMessage.created_at.asc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    msgs = res.scalars().all()
    results = []
    for m in msgs:
        s_name = None
        s_role = None
        s_is_admin = False
        
        if m.sender:
            s_name = m.sender.full_name
            s_role = m.sender.role
            s_is_admin = bool(m.sender.is_admin)
        elif m.extra_meta and isinstance(m.extra_meta, dict):
            s_name = m.extra_meta.get("sender_name")
            s_role = m.extra_meta.get("sender_role")
            s_is_admin = bool(m.extra_meta.get("is_admin", False))
            
        if not s_name:
            if m.extra_meta and isinstance(m.extra_meta, dict) and m.extra_meta.get("is_announcement"):
                s_name = "Maanvi"
                s_role = "Director of People Operations"
                s_is_admin = True
            else:
                s_name = "Parth Parashar"
                s_role = "Software Engineer"
                
        results.append(
            ChannelMessageRead(
                id=m.id,
                channel_id=m.channel_id,
                sender_id=m.sender_id,
                sender_name=s_name,
                sender_role=s_role,
                sender_is_admin=s_is_admin,
                content=m.content,
                metadata=m.extra_meta,
                created_at=m.created_at,
            )
        )
    return results

@router.post("/channels/{channel_id}/messages", response_model=ChannelMessageRead)
async def post_channel_message(
    channel_id: str,
    payload: ChannelMessageCreate,
    sender_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    # Resolve sender details
    sender_name = None
    sender_role = None
    sender_is_admin = False

    if sender_id:
        sender_user = await db.get(User, sender_id)
        if sender_user:
            sender_name = sender_user.full_name
            sender_role = sender_user.role
            sender_is_admin = bool(sender_user.is_admin)

    meta = payload.metadata or {}
    if not sender_name and isinstance(meta, dict):
        sender_name = meta.get("sender_name")
        sender_role = meta.get("sender_role")
        sender_is_admin = bool(meta.get("is_admin", False))

    if not sender_name:
        sender_name = "Maanvi" if sender_is_admin else "Parth Parashar"
        sender_role = "Director of People Operations" if sender_is_admin else "Software Engineer"

    # Merge metadata
    enriched_meta = {
        **(meta if isinstance(meta, dict) else {}),
        "source": "launchmate",
        "sender_name": sender_name,
        "sender_role": sender_role,
        "is_admin": sender_is_admin,
    }

    msg = ChannelMessage(
        channel_id=channel_id,
        sender_id=sender_id,
        content=payload.content,
        extra_meta=enriched_meta,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Check if channel is an announcements channel OR message sent by HR/Admin
    channel_res = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel_obj = channel_res.scalar_one_or_none()
    
    is_ann_channel = bool(
        channel_obj and (
            channel_obj.is_announcement or 
            channel_obj.name.lower() in ["announcements", "announcement"]
        )
    )

    # If it's an announcement channel or posted by HR Admin, dispatch SendGrid notification!
    if is_ann_channel or sender_is_admin:
        ann_title = enriched_meta.get("announcement_title") or (
            f"📢 Announcement from {sender_name}" if sender_is_admin else f"📢 Update in #{channel_obj.name if channel_obj else 'general'}"
        )
        # Store announcement so the top banner stays updated
        ann_record = Announcement(
            title=ann_title,
            body=payload.content,
            creator_id=sender_id,
            read_by=[],
        )
        db.add(ann_record)
        await db.commit()

        # Dispatch email notification to all employees via SendGrid
        try:
            users_res = await db.execute(select(User).where(User.email.isnot(None)))
            employees = users_res.scalars().all()
            for emp in employees:
                await email_service.send_hr_announcement_email(
                    recipient_email=emp.email,
                    recipient_name=emp.full_name or "Colleague",
                    announcement_title=ann_title,
                    announcement_body=payload.content,
                    author_name=sender_name or "Maanvi"
                )
        except Exception as e:
            logger.error(f"Failed to dispatch announcement emails for channel message: {e}")

    return ChannelMessageRead(
        id=msg.id,
        channel_id=msg.channel_id,
        sender_id=msg.sender_id,
        sender_name=sender_name,
        sender_role=sender_role,
        sender_is_admin=sender_is_admin,
        content=msg.content,
        metadata=msg.extra_meta,
        created_at=msg.created_at,
    )

# --- Direct Messages ---
@router.get("/direct", response_model=List[DirectMessageRead])
async def get_direct_messages(
    user_id: str,
    peer_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(DirectMessage)
        .where(
            ((DirectMessage.sender_id == user_id) & (DirectMessage.recipient_id == peer_id)) |
            ((DirectMessage.sender_id == peer_id) & (DirectMessage.recipient_id == user_id))
        )
        .order_by(DirectMessage.created_at.asc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/direct", response_model=DirectMessageRead)
async def send_direct_message(
    payload: DirectMessageCreate,
    sender_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    dm = DirectMessage(
        sender_id=sender_id,
        recipient_id=payload.recipient_id,
        content=payload.content,
    )
    db.add(dm)
    await db.commit()
    await db.refresh(dm)
    return dm

# --- Announcements ---
from app.services.email_service import email_service

@router.get("/announcements", response_model=List[AnnouncementRead])
async def list_announcements(db: AsyncSession = Depends(get_db)):
    stmt = select(Announcement).order_by(Announcement.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/announcements", response_model=AnnouncementRead)
async def create_announcement(
    payload: AnnouncementCreate,
    creator_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    ann = Announcement(
        title=payload.title,
        body=payload.body,
        creator_id=creator_id,
        read_by=[],
    )
    db.add(ann)

    # Automatically post a message into the #announcements channel
    ann_channel_res = await db.execute(select(Channel).where(Channel.name == "announcements"))
    channel_obj = ann_channel_res.scalar_one_or_none()
    if channel_obj:
        chat_msg = ChannelMessage(
            channel_id=channel_obj.id,
            sender_id=creator_id,
            content=f"📢 **COMPANY ANNOUNCEMENT: {payload.title}**\n\n{payload.body}",
            extra_meta={"is_announcement": True, "announcement_title": payload.title}
        )
        db.add(chat_msg)

    await db.commit()
    await db.refresh(ann)

    # Dispatch email notification to all employees via SendGrid
    users_res = await db.execute(select(User).where(User.email.isnot(None)))
    employees = users_res.scalars().all()
    
    author_name = "HR People Operations"
    if creator_id:
        creator_user = await db.get(User, creator_id)
        if creator_user and creator_user.full_name:
            author_name = creator_user.full_name

    for emp in employees:
        try:
            await email_service.send_hr_announcement_email(
                recipient_email=emp.email,
                recipient_name=emp.full_name or "Colleague",
                announcement_title=payload.title,
                announcement_body=payload.body,
                author_name=author_name
            )
        except Exception as e:
            logger.error(f"Failed to dispatch announcement email to {emp.email}: {e}")

    return ann
