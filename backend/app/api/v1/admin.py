import io
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.core.deps import get_current_user, get_current_admin_user
from app.models.user import User
from app.models.checklist_template import ChecklistTemplate
from app.models.task import Task
from app.models.escalation import Escalation
from app.models.document import Document
from app.models.chat_message import ChatMessage
from app.schemas.user import UserResponse, UserCreate
from app.schemas.checklist import (
    ChecklistTemplateCreate,
    ChecklistTemplateResponse
)
from app.schemas.escalation import EscalationResponse, EscalationUpdate
from app.schemas.document import DocumentResponse, DocumentCreate
from app.schemas.task import TaskResponse
from app.services.task_service import task_service
from app.services.escalation_service import escalation_service
from app.services.nudge_service import nudge_service
from app.services.rag_service import rag_service
from app.core.security import get_password_hash

router = APIRouter()

class TaskStatusUpdate(BaseModel):
    status: str

class AdminAssignTaskRequest(BaseModel):
    user_id: Optional[str] = None  # specific user ID, "all", or None
    user_ids: Optional[List[str]] = None  # multiple user IDs
    target_type: str = "individual"  # individual, multiple, role, department, location, all
    target_role: Optional[str] = None  # e.g., "Sales Employee"
    target_department: Optional[str] = None  # e.g., "Engineering"
    target_location: Optional[str] = None  # e.g., "Delhi, India"
    title: str
    description: Optional[str] = None
    category: str = "General"  # IT, HR, Legal, Training, Team, General
    priority: str = "medium"  # high, medium, low, urgent
    due_date: Optional[datetime] = None
    mandatory: bool = True
    reference_doc: Optional[str] = None
    reminder_enabled: bool = True

@router.get("/joiners")
async def list_new_joiners(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
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
            "phone_number": u.phone_number,
            "auth_provider": u.auth_provider,
            "microsoft_id": u.microsoft_id,
            "created_at": u.created_at,
            "stats": stats.model_dump()
        })
    return joiner_records

@router.get("/joiners/{user_id}/tasks", response_model=List[TaskResponse])
async def get_joiner_tasks(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """HR endpoint to inspect an individual employee's onboarding tasks and progress."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
    tasks = await task_service.get_user_tasks(db, user_id)
    return [TaskResponse.model_validate(t) for t in tasks]

@router.post("/joiners", response_model=UserResponse)
async def create_new_joiner(
    joiner_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
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
        phone_number=joiner_in.phone_number,
        experience_level=joiner_in.experience_level or "Mid-Level",
        organization_id=joiner_in.organization_id or getattr(current_user, "organization_id", "launchmate") or "launchmate",
        auth_provider="email",
        microsoft_id=f"{joiner_in.email.lower()}#microsoft",
        hashed_password=get_password_hash(joiner_in.password or "Password123!")
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Automatically generate tasks based on role + location
    await task_service.generate_tasks_for_new_joiner(db, user)

    return UserResponse.model_validate(user)

@router.post("/assign-task", response_model=List[TaskResponse])
async def assign_task_to_employees(
    task_req: AdminAssignTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """
    HR / Admin creates a customized task with an explicit deadline
    assigned to:
    - one specific employee
    - multiple employees
    - a particular role
    - a department
    - a location
    - or an entire onboarding group
    """
    org_id = current_user.organization_id or "launchmate"
    target_users = []

    if task_req.target_type == "all" or task_req.user_id == "all":
        # Assign to all active non-admin employees in organization
        res = await db.execute(select(User).where(User.is_admin == False, User.organization_id == org_id))
        target_users = res.scalars().all()
    elif task_req.target_type == "multiple" and task_req.user_ids:
        res = await db.execute(select(User).where(User.id.in_(task_req.user_ids), User.is_admin == False))
        target_users = res.scalars().all()
    elif task_req.target_type == "role" and task_req.target_role:
        res = await db.execute(select(User).where(
            User.is_admin == False,
            User.organization_id == org_id,
            User.role.ilike(f"%{task_req.target_role}%")
        ))
        target_users = res.scalars().all()
    elif task_req.target_type == "department" and task_req.target_department:
        res = await db.execute(select(User).where(
            User.is_admin == False,
            User.organization_id == org_id,
            User.department.ilike(f"%{task_req.target_department}%")
        ))
        target_users = res.scalars().all()
    elif task_req.target_type == "location" and task_req.target_location:
        res = await db.execute(select(User).where(
            User.is_admin == False,
            User.organization_id == org_id,
            User.location.ilike(f"%{task_req.target_location}%")
        ))
        target_users = res.scalars().all()
    elif task_req.user_id:
        user = await db.get(User, task_req.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Employee not found")
        target_users = [user]
    else:
        raise HTTPException(status_code=400, detail="Invalid target specified for task assignment")

    if not target_users:
        raise HTTPException(status_code=404, detail="No matching employees found for the target criteria")

    created_tasks = []
    now = datetime.now(timezone.utc)
    due_date = task_req.due_date or (now + timedelta(days=3))

    for u in target_users:
        # Check duplicate task for this user
        existing_res = await db.execute(
            select(Task).where(Task.user_id == u.id, Task.title.ilike(task_req.title.strip()))
        )
        existing = existing_res.scalar_one_or_none()
        if existing:
            created_tasks.append(existing)
            continue

        new_task = Task(
            user_id=u.id,
            title=task_req.title.strip(),
            description=task_req.description,
            category=task_req.category,
            task_type="hr_custom",
            priority=task_req.priority,
            mandatory=task_req.mandatory,
            reference_doc=task_req.reference_doc,
            status="pending",
            due_date=due_date,
            metadata_json={
                "assigned_by": current_user.full_name,
                "assigned_at": now.isoformat(),
                "target_type": task_req.target_type,
                "reminder_enabled": task_req.reminder_enabled
            }
        )
        db.add(new_task)
        created_tasks.append(new_task)

    await db.commit()
    for t in created_tasks:
        await db.refresh(t)

    return [TaskResponse.model_validate(t) for t in created_tasks]

@router.patch("/tasks/{task_id}/status", response_model=TaskResponse)
async def update_admin_task_status(
    task_id: str,
    status_update: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """Allows HR to update any employee task status (pending, in_progress, completed, overdue, cancelled)."""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = status_update.status
    now = datetime.now(timezone.utc)
    if status_update.status == "completed":
        task.completed_at = now
    elif task.completed_at and status_update.status != "completed":
        task.completed_at = None

    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)

@router.get("/overdue-tasks")
async def get_overdue_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """
    Returns tasks that are past their deadline or due within 24h,
    with employee Microsoft account details.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(select(Task, User).join(User, Task.user_id == User.id).where(Task.status != "completed"))
    rows = result.all()

    overdue_list = []
    for t, u in rows:
        t_due = t.due_date.replace(tzinfo=timezone.utc) if t.due_date and not t.due_date.tzinfo else t.due_date
        is_overdue = t_due and t_due < now
        overdue_list.append({
            "task_id": t.id,
            "title": t.title,
            "category": t.category,
            "priority": t.priority,
            "status": "overdue" if is_overdue else t.status,
            "due_date": t.due_date,
            "is_overdue": is_overdue,
            "employee_id": u.id,
            "employee_name": u.full_name,
            "employee_email": u.email,
            "microsoft_id": u.microsoft_id
        })
    return overdue_list

@router.post("/notify-deadline-overdue")
async def notify_deadline_overdue(
    task_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """
    Sends SendGrid email notifications to employees whose tasks are past deadline.
    """
    if task_id:
        return await nudge_service.notify_employee_overdue_task(db, task_id)
    return await nudge_service.scan_and_send_nudges(db, simulate=False)

@router.get("/templates", response_model=List[ChecklistTemplateResponse])
async def list_checklist_templates(
    role: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
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
    current_user: User = Depends(get_current_admin_user)
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
    current_user: User = Depends(get_current_admin_user)
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """Fetches the HR escalation queue."""
    return await escalation_service.get_escalations(db, status=status)

@router.post("/escalations/{escalation_id}/resolve")
async def resolve_escalation(
    escalation_id: str,
    update_data: EscalationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """Manual trigger to dispatch or simulate overdue nudges for the live demo."""
    if user_id:
        return await nudge_service.fast_forward_demo_nudge(db, user_id)
    return await nudge_service.scan_and_send_nudges(db, simulate=simulate)

def extract_text_from_bytes(filename: str, file_bytes: bytes) -> str:
    """Extracts plain text from DOCX, PDF, or text-based documents."""
    lower_name = filename.lower()
    if lower_name.endswith(".docx"):
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                xml_content = z.read("word/document.xml")
                tree = ET.fromstring(xml_content)
                namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                paragraphs = []
                for p in tree.iterfind('.//w:p', namespaces):
                    texts = [node.text for node in p.iterfind('.//w:t', namespaces) if node.text]
                    if texts:
                        paragraphs.append(''.join(texts))
                return '\n\n'.join(paragraphs)
        except Exception as e:
            raise ValueError(f"Failed to parse DOCX file: {e}")
    elif lower_name.endswith(".pdf"):
        # Basic text stream extraction fallback for PDFs without external dependencies
        text_parts = []
        try:
            decoded = file_bytes.decode('latin-1', errors='ignore')
            matches = re.findall(r'\((.*?)\)\s*Tj', decoded)
            if matches:
                text_parts.extend(matches)
            else:
                printable = re.findall(r'[A-Za-z0-9 .,:;!?\n\-\'\"]{4,}', decoded)
                text_parts.extend(printable[:200])
            extracted = "\n".join(text_parts).strip()
            if len(extracted) > 20:
                return extracted
        except Exception:
            pass
        raise ValueError("Could not extract readable text from PDF. Please provide .docx, .md, or .txt format.")
    else:
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return file_bytes.decode("latin-1", errors="ignore")

@router.get("/documents", response_model=List[DocumentResponse])
async def list_documents(
    organization_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """Lists indexed documents in the RAG knowledge repository."""
    target_org = organization_id or current_user.organization_id or "launchmate"
    stmt = (
        select(Document)
        .options(selectinload(Document.chunks))
        .where(Document.organization_id == target_org)
        .order_by(Document.category, Document.title)
    )
    res = await db.execute(stmt)
    docs = res.scalars().all()
    return [DocumentResponse.model_validate(d) for d in docs]

@router.post("/documents", response_model=DocumentResponse)
async def upload_document(
    doc_in: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """
    Ingests, chunks, embeds, and indexes a new company policy or handbook into the RAG vector store.
    Deduplicates against existing documents for the organization.
    """
    target_org = doc_in.organization_id or current_user.organization_id or "launchmate"
    raw_content = doc_in.content.strip()
    if not raw_content:
        raise HTTPException(status_code=400, detail="Document content cannot be empty.")

    doc, is_duplicate = await rag_service.ingest_document(
        db=db,
        title=doc_in.title,
        category=doc_in.category,
        source_file=doc_in.source_file,
        raw_text=raw_content,
        organization_id=target_org,
        file_type="text",
        file_size=len(raw_content.encode("utf-8"))
    )

    if is_duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This document has already been uploaded and processed."
        )

    return DocumentResponse.model_validate(doc)

@router.post("/documents/upload-file", response_model=DocumentResponse)
async def upload_file_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    category: str = Form("General"),
    organization_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """
    One-time file ingestion for DOCX, PDF, Markdown, and text documents.
    Validates, extracts text, chunks, embeds, and indexes into the organization knowledge base.
    Rejects duplicate uploads with a clear message.
    """
    target_org = organization_id or current_user.organization_id or "launchmate"
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    file_name = file.filename or "uploaded_document.txt"
    doc_title = title.strip() if title and title.strip() else file_name.rsplit(".", 1)[0].replace("_", " ").title()
    file_extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "txt"

    try:
        raw_text = extract_text_from_bytes(file_name, file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not raw_text or len(raw_text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Document contains insufficient readable text.")

    doc, is_duplicate = await rag_service.ingest_document(
        db=db,
        title=doc_title,
        category=category,
        source_file=file_name,
        raw_text=raw_text,
        organization_id=target_org,
        file_type=file_extension,
        file_size=len(file_bytes)
    )

    if is_duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This document has already been uploaded and processed."
        )

    return DocumentResponse.model_validate(doc)

@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    await db.commit()
    return {"status": "deleted", "id": document_id}

@router.get("/common-questions")
async def get_common_questions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
    """
    Analyzes all employee chat interactions to surface top queries and themes for HR oversight.
    """
    stmt = select(ChatMessage).where(ChatMessage.sender == "user").order_by(desc(ChatMessage.created_at)).limit(100)
    res = await db.execute(stmt)
    messages = res.scalars().all()

    # Aggregate common themes / topics
    topics: Dict[str, int] = {
        "Leave & Paid Time Off (PTO)": 0,
        "Laptop Setup & Intune": 0,
        "Health Insurance & 401(k)": 0,
        "MFA & Authentication Setup": 0,
        "Onboarding Buddy & Meetings": 0,
        "Workspace Reimbursement ($1,200)": 0,
        "Travel & Expense Policy": 0,
        "Other Inquiries": 0
    }

    recent_queries = []
    for m in messages:
        c_lower = m.content.lower()
        categorized = False
        if any(w in c_lower for w in ["leave", "pto", "holiday", "casual", "vacation", "sick"]):
            topics["Leave & Paid Time Off (PTO)"] += 1
            categorized = True
        elif any(w in c_lower for w in ["laptop", "intune", "device", "hardware", "mac", "windows"]):
            topics["Laptop Setup & Intune"] += 1
            categorized = True
        elif any(w in c_lower for w in ["health", "dental", "insurance", "401k", "benefit"]):
            topics["Health Insurance & 401(k)"] += 1
            categorized = True
        elif any(w in c_lower for w in ["mfa", "authenticator", "password", "login"]):
            topics["MFA & Authentication Setup"] += 1
            categorized = True
        elif any(w in c_lower for w in ["buddy", "mentor", "coffee", "meeting"]):
            topics["Onboarding Buddy & Meetings"] += 1
            categorized = True
        elif any(w in c_lower for w in ["stipend", "1200", "reimbursement", "ergonomic", "desk", "chair"]):
            topics["Workspace Reimbursement ($1,200)"] += 1
            categorized = True
        elif any(w in c_lower for w in ["travel", "expense", "concur", "per diem", "hotel"]):
            topics["Travel & Expense Policy"] += 1
            categorized = True
        else:
            topics["Other Inquiries"] += 1

        recent_queries.append({
            "content": m.content,
            "created_at": m.created_at.isoformat()
        })

    # Sort topics by frequency
    sorted_topics = sorted(
        [{"topic": k, "count": v} for k, v in topics.items()],
        key=lambda x: x["count"],
        reverse=True
    )

    return {
        "total_queries_analyzed": len(messages),
        "top_topics": sorted_topics,
        "recent_employee_queries": recent_queries[:15]
    }

@router.get("/stats")
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
) -> Any:
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
        "sendgrid_status": "active",
        "agent_status": "operational",
        "vector_index_status": "healthy"
    }
