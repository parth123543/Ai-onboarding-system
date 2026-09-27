import json
import logging
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.models.chat_message import ChatMessage
from app.services.agent_router import agent_router_service
from app.services.rag_service import rag_service
from app.services.task_service import task_service
from app.services.escalation_service import escalation_service

logger = logging.getLogger("teams_service")
logger.setLevel(logging.INFO)

class TeamsBotService:
    async def process_activity(self, db: AsyncSession, activity_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Receives Microsoft Teams / Azure Bot Framework Activity payload,
        routes it through the unified agent router and RAG/Task/Escalation services,
        and returns an Activity response ready for Azure Bot Service.
        """
        activity_type = activity_data.get("type", "message")
        recipient = activity_data.get("recipient", {})
        sender = activity_data.get("from", {})
        conversation = activity_data.get("conversation", {})
        user_text = activity_data.get("text", "").strip()

        # Handle welcome event (conversationUpdate)
        if activity_type == "conversationUpdate":
            welcome_text = (
                "👋 **Welcome to Microsoft Contoso!** I am your AI Onboarding Assistant.\n\n"
                "You can ask me anything about your role, policies, benefits, or type **'Show my checklist'** to get started."
            )
            return self._build_teams_response(activity_data, welcome_text)

        if not user_text:
            return self._build_teams_response(activity_data, "I didn't receive any text in your message. How can I help with your onboarding?")

        # Resolve or find user by email/name or default to primary demo user
        sender_email = sender.get("email") or sender.get("name") or "sarah.chen@microsoft.com"
        result = await db.execute(select(User).where(User.email.ilike(f"%{sender_email}%")))
        user = result.scalar_one_or_none()
        if not user:
            # Fallback to first user in database
            result = await db.execute(select(User).limit(1))
            user = result.scalar_one_or_none()

        if not user:
            return self._build_teams_response(activity_data, "Please initialize the onboarding system database first.")

        # Save incoming message
        conv_id = conversation.get("id", "teams-default")
        db.add(ChatMessage(
            user_id=user.id,
            conversation_id=conv_id,
            sender="user",
            content=user_text
        ))
        await db.commit()

        # Step 1: Agent Router Classification
        decision = await agent_router_service.route(user_text, user.id)

        reply_text = ""
        citations_data = None
        action_data = None

        if decision.category == "escalate":
            esc, reply_text = await escalation_service.create_escalation(
                db=db,
                user=user,
                conversation_id=conv_id,
                reason=decision.reasoning,
                trigger_message=user_text,
                sensitivity_reason=decision.sensitivity_reason
            )
        elif decision.category == "task_action":
            action_result = await task_service.execute_agent_action(
                db=db,
                user=user,
                action_name=decision.detected_action,
                parameters=decision.action_parameters
            )
            reply_text = action_result["message"]
            action_data = action_result
        else:  # knowledge_query
            chunks = await rag_service.retrieve_relevant_chunks(db, user_text)
            reply_text, citations = await rag_service.generate_grounded_answer(user_text, chunks)
            citations_data = [c.model_dump() for c in citations]

        # Record assistant reply
        db.add(ChatMessage(
            user_id=user.id,
            conversation_id=conv_id,
            sender="assistant",
            content=reply_text,
            category=decision.category,
            confidence=decision.confidence,
            citations=citations_data,
            agent_action=action_data
        ))
        await db.commit()

        return self._build_teams_response(activity_data, reply_text)

    def _build_teams_response(self, incoming: Dict[str, Any], text: str) -> Dict[str, Any]:
        """Formats standard Bot Framework Activity reply."""
        return {
            "type": "message",
            "from": incoming.get("recipient", {"id": "ai-onboarding-bot", "name": "AI Onboarding Assistant"}),
            "recipient": incoming.get("from", {}),
            "conversation": incoming.get("conversation", {}),
            "replyToId": incoming.get("id"),
            "text": text,
            "textFormat": "markdown"
        }

teams_bot_service = TeamsBotService()
