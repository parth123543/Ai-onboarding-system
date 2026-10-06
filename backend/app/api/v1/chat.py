import json
import logging
from typing import List, Optional, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete
from app.db.session import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models.user import User
from app.models.chat_message import ChatMessage
from app.schemas.chat import (
    ChatMessageCreate,
    ChatResponse,
    Citation,
    TeamsActivity
)
from app.services.agent_router import agent_router_service
from app.services.rag_service import rag_service
from app.services.task_service import task_service
from app.services.escalation_service import escalation_service
from app.services.teams_service import teams_bot_service

router = APIRouter()
logger = logging.getLogger("chat_api")

@router.post("", response_model=ChatResponse)
async def chat_turn(
    chat_in: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Standard synchronous chat turn:
    User Message -> Agent Router -> [RAG | Task Tracker Action | Human Escalation] -> Response
    """
    user_msg = ChatMessage(
        user_id=current_user.id,
        conversation_id=chat_in.conversation_id,
        sender="user",
        content=chat_in.content
    )
    db.add(user_msg)
    await db.commit()

    # Step 1: Core Agent Router
    decision = await agent_router_service.route(chat_in.content, current_user.id)

    reply_content = ""
    citations_data = None
    agent_action_data = None

    if decision.category == "escalate":
        esc, reply_content = await escalation_service.create_escalation(
            db=db,
            user=current_user,
            conversation_id=chat_in.conversation_id,
            reason=decision.reasoning,
            trigger_message=chat_in.content,
            sensitivity_reason=decision.sensitivity_reason
        )
        agent_action_data = {
            "type": "escalation_created",
            "escalation_id": esc.id,
            "priority": esc.priority,
            "reason": esc.reason
        }

    elif decision.category == "task_action":
        action_result = await task_service.execute_agent_action(
            db=db,
            user=current_user,
            action_name=decision.detected_action,
            parameters=decision.action_parameters
        )
        reply_content = action_result["message"]
        agent_action_data = action_result

    else:  # knowledge_query
        user_org = getattr(current_user, "organization_id", "launchmate") or "launchmate"
        chunks = await rag_service.retrieve_relevant_chunks(db, chat_in.content, organization_id=user_org)
        reply_content, citations = await rag_service.generate_grounded_answer(chat_in.content, chunks)
        citations_data = [c.model_dump() for c in citations]

    # Save Assistant Response
    bot_msg = ChatMessage(
        user_id=current_user.id,
        conversation_id=chat_in.conversation_id,
        sender="assistant",
        content=reply_content,
        category=decision.category,
        confidence=decision.confidence,
        citations=citations_data,
        agent_action=agent_action_data
    )
    db.add(bot_msg)
    await db.commit()
    await db.refresh(bot_msg)

    # Convert citations to Pydantic objects if present
    parsed_citations = [Citation(**c) for c in citations_data] if citations_data else None

    return ChatResponse(
        id=bot_msg.id,
        conversation_id=bot_msg.conversation_id,
        sender="assistant",
        content=bot_msg.content,
        category=bot_msg.category,
        confidence=bot_msg.confidence,
        citations=parsed_citations,
        agent_action=bot_msg.agent_action,
        created_at=bot_msg.created_at
    )

@router.get("/stream")
async def chat_stream(
    message: str = Query(..., description="User message text"),
    conversation_id: str = Query("default", description="Conversation session ID"),
    token: Optional[str] = Query(None, description="Auth bearer token"),
    db: AsyncSession = Depends(get_db)
):
    """
    Server-Sent Events (SSE) Streaming endpoint for token-by-token chat responses.
    Streams JSON events: {type: 'router'}, {type: 'action'}, {type: 'citations'}, {type: 'token', token: '...'}, {type: 'done'}
    """
    from app.core.security import decode_access_token
    # Authenticate via query param token or default to primary demo user
    user = None
    if token:
        payload = decode_access_token(token)
        if payload and payload.get("sub"):
            user = await db.get(User, payload["sub"])

    if not user:
        # Default to first user in database for smooth streaming test
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")

    async def event_generator():
        # Record user message
        db.add(ChatMessage(
            user_id=user.id,
            conversation_id=conversation_id,
            sender="user",
            content=message
        ))
        await db.commit()

        # Step 1: Route message
        decision = await agent_router_service.route(message, user.id)
        yield f"data: {json.dumps({'type': 'router', 'decision': decision.model_dump()})}\n\n"

        full_response = ""
        citations_data = None
        action_data = None

        if decision.category == "escalate":
            esc, reply = await escalation_service.create_escalation(
                db=db,
                user=user,
                conversation_id=conversation_id,
                reason=decision.reasoning,
                trigger_message=message,
                sensitivity_reason=decision.sensitivity_reason
            )
            full_response = reply
            action_data = {
                "type": "escalation_created",
                "ticket_id": esc.id[:6].upper(),
                "reason": esc.reason,
                "message": f"Priority Human Escalation #{esc.id[:6].upper()} opened."
            }
            yield f"data: {json.dumps({'type': 'action', 'action': action_data})}\n\n"
            for word in reply.split(" "):
                yield f"data: {json.dumps({'type': 'token', 'token': word + ' '})}\n\n"

        elif decision.category == "task_action":
            action_result = await task_service.execute_agent_action(
                db=db,
                user=user,
                action_name=decision.detected_action,
                parameters=decision.action_parameters
            )
            full_response = action_result["message"]
            action_data = action_result
            yield f"data: {json.dumps({'type': 'action', 'action': action_result})}\n\n"
            for word in full_response.split(" "):
                yield f"data: {json.dumps({'type': 'token', 'token': word + ' '})}\n\n"

        else:  # knowledge_query -> stream RAG answer
            user_org = getattr(user, "organization_id", "launchmate") or "launchmate"
            chunks = await rag_service.retrieve_relevant_chunks(db, message, organization_id=user_org)
            async for sse_event in rag_service.stream_grounded_answer(message, chunks):
                if sse_event["type"] == "token":
                    full_response += sse_event["token"]
                elif sse_event["type"] == "citations":
                    citations_data = sse_event["citations"]
                yield f"data: {json.dumps(sse_event)}\n\n"

        # Record assistant reply in DB
        db.add(ChatMessage(
            user_id=user.id,
            conversation_id=conversation_id,
            sender="assistant",
            content=full_response,
            category=decision.category,
            confidence=decision.confidence,
            citations=citations_data,
            agent_action=action_data
        ))
        await db.commit()
        yield f"data: {json.dumps({'type': 'done', 'category': decision.category})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/history", response_model=List[ChatResponse])
async def get_chat_history(
    conversation_id: str = Query("default"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Returns conversation history for current user session."""
    stmt = (
        select(ChatMessage)
        .where(and_(ChatMessage.user_id == current_user.id, ChatMessage.conversation_id == conversation_id))
        .order_by(ChatMessage.created_at.asc())
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()
    
    responses = []
    for m in messages:
        cits = [Citation(**c) for c in m.citations] if m.citations else None
        responses.append(ChatResponse(
            id=m.id,
            conversation_id=m.conversation_id,
            sender=m.sender,
            content=m.content,
            category=m.category,
            confidence=m.confidence,
            citations=cits,
            agent_action=m.agent_action,
            created_at=m.created_at
        ))
    return responses

@router.delete("/history")
async def clear_chat_history(
    conversation_id: str = Query("default"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Clears conversation history for a fresh demo run."""
    stmt = delete(ChatMessage).where(
        and_(ChatMessage.user_id == current_user.id, ChatMessage.conversation_id == conversation_id)
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "cleared", "conversation_id": conversation_id}

@router.post("/teams")
async def teams_bot_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Microsoft Bot Framework / Azure Bot Service webhook endpoint.
    Exposes the Onboarding Assistant directly inside Microsoft Teams.
    """
    body = await request.json()
    response_activity = await teams_bot_service.process_activity(db, body)
    return response_activity

class DirectEscalationRequest(BaseModel):
    reason: str = "User Reported Issue"
    summary: str
    priority: str = "high"

@router.post("/escalate")
async def report_issue_or_escalate(
    req: DirectEscalationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Allows a new joinee to report an issue or directly escalate a concern to HR.
    Immediately creates a priority ticket in the HR Admin portal.
    """
    esc, reply_content = await escalation_service.create_escalation(
        db=db,
        user=current_user,
        conversation_id="direct_issue_report",
        reason=req.reason,
        trigger_message=req.summary,
        sensitivity_reason=req.reason
    )
    return {
        "status": "escalated",
        "escalation_id": esc.id,
        "priority": esc.priority,
        "message": "Your issue has been reported and escalated to the HR & Operations team. An HR representative will reach out shortly."
    }

