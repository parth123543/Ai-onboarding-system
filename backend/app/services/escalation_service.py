import json
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from app.models.escalation import Escalation
from app.models.user import User
from app.models.chat_message import ChatMessage
from app.schemas.escalation import EscalationResponse
from app.core.config import settings

logger = logging.getLogger("escalation_service")
logger.setLevel(logging.INFO)

class EscalationService:
    async def create_escalation(
        self,
        db: AsyncSession,
        user: User,
        conversation_id: str,
        reason: str,
        trigger_message: str,
        sensitivity_reason: Optional[str] = None
    ) -> Tuple[Escalation, str]:
        """
        1. Snapshots conversation context
        2. Creates an Escalation ticket in the database
        3. Enqueues HR notification (Slack/Email)
        4. Returns the created escalation and an empathetic user message
        """
        # Fetch last 8 messages for context snapshot
        stmt = (
            select(ChatMessage)
            .where(and_(ChatMessage.user_id == user.id, ChatMessage.conversation_id == conversation_id))
            .order_by(desc(ChatMessage.created_at))
            .limit(8)
        )
        res = await db.execute(stmt)
        recent_messages = res.scalars().all()
        recent_messages.reverse()

        context_snapshot = [
            {
                "sender": m.sender,
                "content": m.content,
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m in recent_messages
        ]
        # Include triggering message if not present
        if not context_snapshot or context_snapshot[-1]["content"] != trigger_message:
            context_snapshot.append({
                "sender": "user",
                "content": trigger_message,
                "created_at": datetime.now(timezone.utc).isoformat()
            })

        priority = "urgent" if sensitivity_reason in ["Workplace Conduct & Harassment", "Legal & Compliance Issue", "Employee Wellbeing & Crisis Support"] else "high"
        summary_title = sensitivity_reason or reason or "Assistance Required"
        summary = f"{summary_title}: New joiner {user.full_name} ({user.role}, {user.location}) requires HR assistance. Trigger: \"{trigger_message[:120]}\""

        escalation = Escalation(
            user_id=user.id,
            conversation_id=conversation_id,
            reason=summary_title,
            priority=priority,
            status="open",
            summary=summary,
            context_messages=context_snapshot,
            hr_assigned_to="People Partner (Unassigned)"
        )
        db.add(escalation)
        await db.commit()
        await db.refresh(escalation)

        # Notify HR channel asynchronously
        await self._notify_hr_channel(escalation, user)

        # Honest, clear response to the user
        response_text = (
            f"I want to make sure you get the best and most accurate support for this. "
            f"Because this involves **{summary_title}**, I have opened an HR priority ticket (**#ESC-{escalation.id[:6].upper()}**) "
            f"and attached our conversation context.\n\n"
            f"A dedicated People Operations partner has been alerted and will reach out to you directly via Microsoft Teams or email within 2-4 business hours.\n\n"
            f"📞 **Need immediate live help?** You can connect with an agent immediately using the **'Call Assigned Support Agent Now'** button below or the **Call Agent** phone icon in the top header."
        )

        return escalation, response_text

    async def _notify_hr_channel(self, escalation: Escalation, user: User):
        """Asynchronously dispatches alert to HR Slack channel or email."""
        log_payload = {
            "event": "escalation_alert_enqueued",
            "escalation_id": escalation.id,
            "priority": escalation.priority,
            "user": user.full_name,
            "email": user.email,
            "role": user.role,
            "location": user.location,
            "reason": escalation.reason,
            "channel": "Slack #hr-escalations"
        }
        logger.info(json.dumps(log_payload))

        # Slack Webhook if configured
        if settings.SLACK_WEBHOOK_URL:
            try:
                import httpx
                slack_payload = {
                    "text": f":warning: *HR Escalation Alert* [Priority: {escalation.priority.upper()}]\n"
                            f"*Employee:* {user.full_name} ({user.role} - {user.location})\n"
                            f"*Reason:* {escalation.reason}\n"
                            f"*Summary:* {escalation.summary}\n"
                            f"*Ticket:* #ESC-{escalation.id[:6].upper()}"
                }
                async with httpx.AsyncClient() as client:
                    await client.post(settings.SLACK_WEBHOOK_URL, json=slack_payload, timeout=5.0)
            except Exception as e:
                logger.error(f"Failed to post to Slack webhook: {e}")

    async def get_escalations(
        self,
        db: AsyncSession,
        status: Optional[str] = None
    ) -> List[EscalationResponse]:
        """Lists escalations for HR / Admin dashboard."""
        stmt = (
            select(Escalation, User)
            .join(User, Escalation.user_id == User.id)
            .order_by(desc(Escalation.created_at))
        )
        if status:
            stmt = stmt.where(Escalation.status == status)

        result = await db.execute(stmt)
        rows = result.all()

        responses = []
        for esc, user in rows:
            responses.append(EscalationResponse(
                id=esc.id,
                user_id=esc.user_id,
                conversation_id=esc.conversation_id,
                reason=esc.reason,
                status=esc.status,
                priority=esc.priority,
                summary=esc.summary,
                context_messages=esc.context_messages,
                hr_assigned_to=esc.hr_assigned_to,
                resolution_notes=esc.resolution_notes,
                resolved_at=esc.resolved_at,
                created_at=esc.created_at,
                updated_at=esc.updated_at,
                user_name=user.full_name,
                user_email=user.email
            ))
        return responses

    async def resolve_escalation(
        self,
        db: AsyncSession,
        escalation_id: str,
        hr_name: str,
        notes: str
    ) -> Optional[Escalation]:
        """Marks an escalation ticket as resolved with notes."""
        result = await db.execute(select(Escalation).where(Escalation.id == escalation_id))
        esc = result.scalar_one_or_none()
        if not esc:
            return None

        esc.status = "resolved"
        esc.hr_assigned_to = hr_name or "HR Operations"
        esc.resolution_notes = notes or "Resolved after 1-on-1 contact."
        esc.resolved_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(esc)
        return esc

escalation_service = EscalationService()
