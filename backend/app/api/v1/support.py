from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models.user import User
from app.services.call_service import call_service

router = APIRouter()

class CallRequestCreate(BaseModel):
    phone_number: str
    topic: Optional[str] = "Live assistance for onboarding query"
    call_type: str = "callback"  # callback, direct_dial, in_browser_simulation
    notes: Optional[str] = None

class UpdatePhoneRequest(BaseModel):
    line_id: str  # line_1, line_2, line_3
    phone_number: str

@router.get("/lines")
async def get_agent_lines(
    topic: Optional[str] = Query(None),
    current_user: Optional[User] = Depends(get_optional_user)
) -> Any:
    """Returns available support lines and the assigned line for the current employee (or guest)."""
    all_lines = call_service.get_lines()
    assigned = call_service.assign_line_for_user(current_user, topic=topic)
    return {
        "assigned_line": assigned,
        "all_lines": all_lines,
        "user_phone": (current_user.phone_number or "") if current_user else ""
    }

@router.post("/request-call")
async def request_agent_call(
    req: CallRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
) -> Any:
    """Requests an Amazon-style instant callback or logs a live call to an assigned agent."""
    if not req.phone_number.strip():
        raise HTTPException(status_code=400, detail="A valid phone number is required")

    record = await call_service.log_call_request(
        db=db,
        user=current_user,
        phone_number=req.phone_number,
        topic=req.topic or "Onboarding question",
        call_type=req.call_type,
        notes=req.notes
    )

    return {
        "status": "call_initiated",
        "call_id": record.id,
        "assigned_agent": record.assigned_agent_name,
        "assigned_phone_number": record.assigned_phone_number,
        "message": (
            f"Instant connection queued! {record.assigned_agent_name} will connect with you at "
            f"{record.phone_number} within 30 seconds."
        ),
        "created_at": record.created_at.isoformat()
    }

@router.get("/calls")
async def list_call_requests(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Returns recent call requests."""
    calls = await call_service.get_recent_calls(db, limit=limit)
    return [
        {
            "id": c.id,
            "user_id": c.user_id,
            "phone_number": c.phone_number,
            "assigned_agent_name": c.assigned_agent_name,
            "assigned_phone_number": c.assigned_phone_number,
            "topic": c.topic,
            "status": c.status,
            "call_type": c.call_type,
            "created_at": c.created_at.isoformat()
        }
        for c in calls
    ]

@router.post("/update-phone")
async def update_phone_line(
    req: UpdatePhoneRequest,
    current_user: User = Depends(get_current_user)
) -> Any:
    """Updates one of the 3 support line phone numbers."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only HR / IT administrators can reconfigure helpline numbers")

    success = call_service.update_phone_number(req.line_id, req.phone_number)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid line_id (must be line_1, line_2, or line_3)")

    return {
        "status": "updated",
        "line_id": req.line_id,
        "phone_number": req.phone_number,
        "all_lines": call_service.get_lines()
    }
