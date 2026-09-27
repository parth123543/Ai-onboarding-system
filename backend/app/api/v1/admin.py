from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.checklist_template import ChecklistTemplate
from app.models.task import Task
from app.models.escalation import Escalation
from app.models.document import Document
from app.schemas.user import UserResponse, UserCreate
from app.schemas.checklist import (
    ChecklistTemplateCreate,
    ChecklistTemplateResponse
)
from app.schemas.escalation import EscalationResponse, EscalationUpdate
from app.schemas.document import DocumentResponse
from app.services.task_service import task_service
from app.services.escalation_service import escalation_service
from app.services.nudge_service import nudge_service
from app.core.security import get_password_hash

router = APIRouter()

@router.get("/joiners")
async def list_new_joiners(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Lists all new joiners with their onboarding stats for the HR dashboard."""
    stmt = select(User).where(User.is_admin == False).order_by(desc(User.created_at))
    result = await db.execute(stmt)
    users = result.scalars().all()

    joiner_records = []
    for u in users:
        stats = await task_service.get_stats(db, u.id)
        joiner_records.append({
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "department": u.department,
            "location": u.location,
            "created_at": u.created_at,
            "stats": stats.model_dump()
        })
    return joiner_records

@router.post("/joiners", response_model=UserResponse)
async def create_new_joiner(
    joiner_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Admin endpoint to provision a new joiner and generate their personalized tasks."""
    res = await db.execute(select(User).where(User.email == joiner_in.email.lower()))
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already exists")

    user = User(
        email=joiner_in.email.lower(),
        full_name=joiner_in.full_name,
        role=joiner_in.role,
        department=joiner_in.department,
        location=joiner_in.location,
        is_admin=joiner_in.is_admin,
        hashed_password=get_password_hash(joiner_in.password)
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Automatically generate tasks based on role + location
    await task_service.generate_tasks_for_new_joiner(db, user)

    return UserResponse.model_validate(user)

@router.get("/templates", response_model=List[ChecklistTemplateResponse])
async def list_checklist_templates(
    role: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Lists checklist templates optionally filtered by role or location."""
    stmt = select(ChecklistTemplate).order_by(ChecklistTemplate.category, ChecklistTemplate.due_days_from_hire)
    if role:
        stmt = stmt.where(ChecklistTemplate.role.ilike(f"%{role}%"))
    if location:
        stmt = stmt.where(ChecklistTemplate.location.ilike(f"%{location}%"))
        
    res = await db.execute(stmt)
    templates = res.scalars().all()
    return [ChecklistTemplateResponse.model_validate(t) for t in templates]

@router.post("/templates", response_model=ChecklistTemplateResponse)
async def create_checklist_template(
    template_in: ChecklistTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Creates a new checklist template keyed by role and location."""
    template = ChecklistTemplate(
        role=template_in.role,
        location=template_in.location,
        department=template_in.department,
        title=template_in.title,
        description=template_in.description,
        category=template_in.category,
        due_days_from_hire=template_in.due_days_from_hire,
        required=template_in.required,
        priority=template_in.priority
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return ChecklistTemplateResponse.model_validate(template)

@router.delete("/templates/{template_id}")
async def delete_checklist_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    template = await db.get(ChecklistTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
    await db.commit()
    return {"status": "deleted", "id": template_id}

@router.get("/escalations", response_model=List[EscalationResponse])
async def get_escalations(
    status: Optional[str] = Query(None, description="open, in_review, resolved"),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Fetches the HR escalation queue."""
    return await escalation_service.get_escalations(db, status=status)

@router.post("/escalations/{escalation_id}/resolve")
async def resolve_escalation(
    escalation_id: str,
    update_data: EscalationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Marks an escalation resolved with HR resolution notes."""
    resolved = await escalation_service.resolve_escalation(
        db=db,
        escalation_id=escalation_id,
        hr_name=update_data.hr_assigned_to or current_user.full_name,
        notes=update_data.resolution_notes or "Resolved by HR Admin."
    )
    if not resolved:
        raise HTTPException(status_code=404, detail="Escalation record not found")
    return {"status": "resolved", "id": escalation_id}

@router.post("/nudges/trigger")
async def trigger_nudges_manually(
    user_id: Optional[str] = Query(None),
    simulate: bool = Query(False),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Manual trigger to dispatch or simulate overdue nudges for the live demo."""
    if user_id:
        return await nudge_service.fast_forward_demo_nudge(db, user_id)
    return await nudge_service.scan_and_send_nudges(db, simulate=simulate)

@router.get("/documents", response_model=List[DocumentResponse])
async def list_documents(db: AsyncSession = Depends(get_db)) -> Any:
    """Lists indexed documents in the RAG knowledge repository."""
    stmt = select(Document).order_by(Document.category, Document.title)
    res = await db.execute(stmt)
    docs = res.scalars().all()
    return [DocumentResponse.model_validate(d) for d in docs]

@router.get("/stats")
async def get_system_stats(db: AsyncSession = Depends(get_db)) -> Any:
    """High level KPIs and health statistics."""
    total_users = await db.scalar(select(func.count(User.id)).where(User.is_admin == False))
    total_tasks = await db.scalar(select(func.count(Task.id)))
    completed_tasks = await db.scalar(select(func.count(Task.id)).where(Task.status == "completed"))
    open_escalations = await db.scalar(select(func.count(Escalation.id)).where(Escalation.status == "open"))
    total_docs = await db.scalar(select(func.count(Document.id)))

    avg_completion = round((completed_tasks / total_tasks * 100), 1) if total_tasks and total_tasks > 0 else 0.0

    return {
        "total_new_joiners": total_users or 0,
        "total_tasks_assigned": total_tasks or 0,
        "completed_tasks": completed_tasks or 0,
        "overall_completion_rate": avg_completion,
        "open_escalations": open_escalations or 0,
        "indexed_documents": total_docs or 0,
        "agent_status": "operational",
        "vector_index_status": "healthy"
    }
