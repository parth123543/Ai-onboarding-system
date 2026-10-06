"""
FastAPI Router for Microsoft Teams Meetings & Delegated Auth
"""
import logging
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.services.teams_integration import teams_service

logger = logging.getLogger("teams_api")
router = APIRouter()

class MeetingCreateRequest(BaseModel):
    subject: str = "HR 1-on-1 Onboarding Check-in"
    start_time: str  # ISO string: e.g. "2026-10-06T14:00:00Z"
    end_time: str    # ISO string: e.g. "2026-10-06T14:30:00Z"
    attendees: Optional[List[str]] = []

@router.get("/auth/url")
def get_teams_oauth_url(state: str = "teams_connect"):
    """Returns the delegated Microsoft OAuth sign-in URL."""
    url = teams_service.get_auth_url(state=state)
    return {"auth_url": url}

@router.get("/status")
def get_teams_status():
    """Checks whether Microsoft Graph credentials are fully configured."""
    return {
        "configured": bool(teams_service.client_id and teams_service.tenant_id),
        "tenant_id": teams_service.tenant_id,
        "client_id": teams_service.client_id,
        "mode": "delegated_oauth_ready"
    }

@router.post("/meetings", status_code=status.HTTP_201_CREATED)
async def create_meeting(payload: MeetingCreateRequest):
    """
    Creates an online video call meeting via Microsoft Teams / Graph.
    Returns joinUrl directly usable by employees and HR.
    """
    result = await teams_service.create_online_meeting(
        subject=payload.subject,
        start_datetime=payload.start_time,
        end_datetime=payload.end_time,
    )
    return result
