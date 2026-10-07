"""
FastAPI Router for Jira-Grade Task Management (Kanban, Subtasks, Activity, Worklogs)
"""
import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.jira_task import (
    JiraTask,
    JiraSubTask,
    JiraComment,
    JiraWorkLog,
    JiraLabel,
    JiraActivity,
    JiraTaskCounter,
    task_label_association,
)
from app.models.user import User
from app.schemas.jira_task import (
    JiraTaskCreate,
    JiraTaskUpdate,
    JiraTaskRead,
    JiraSubTaskCreate,
    JiraSubTaskRead,
    JiraCommentCreate,
    JiraCommentRead,
    JiraWorkLogCreate,
    JiraWorkLogRead,
    JiraLabelRead,
)

logger = logging.getLogger("jira_tasks_api")
router = APIRouter()

async def get_next_task_key(db: AsyncSession, project_key: str = "LM") -> str:
    counter_stmt = select(JiraTaskCounter).where(JiraTaskCounter.project_key == project_key).with_for_update()
    result = await db.execute(counter_stmt)
    counter = result.scalar_one_or_none()
    if not counter:
        counter = JiraTaskCounter(project_key=project_key, last_num=1)
        db.add(counter)
        await db.flush()
        return f"{project_key}-1"
    counter.last_num += 1
    await db.flush()
    return f"{project_key}-{counter.last_num}"

@router.get("", response_model=List[JiraTaskRead])
async def list_jira_tasks(
    status_filter: Optional[str] = None,
    assignee_id: Optional[str] = None,
    priority: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(JiraTask)
        .options(
            selectinload(JiraTask.labels),
            selectinload(JiraTask.subtasks),
            selectinload(JiraTask.assignee),
            selectinload(JiraTask.reporter),
        )
        .order_by(JiraTask.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(JiraTask.status == status_filter)
    if assignee_id:
        stmt = stmt.where(JiraTask.assignee_id == assignee_id)
    if priority:
        stmt = stmt.where(JiraTask.priority == priority)

    res = await db.execute(stmt)
    tasks = res.scalars().all()
    
    out = []
    for t in tasks:
        item = JiraTaskRead(
            id=t.id,
            key=t.key,
            title=t.title,
            description=t.description,
            type=t.type,
            status=t.status,
            priority=t.priority,
            assignee_id=t.assignee_id,
            reporter_id=t.reporter_id,
            due_date=t.due_date,
            sla_hours=t.sla_hours,
            story_points=t.story_points,
            category=t.category,
            onboarding_day=t.onboarding_day,
            completed_at=t.completed_at,
            created_at=t.created_at,
            updated_at=t.updated_at,
            time_spent_hours=t.time_spent_hours or 0.0,
            assignee_name=t.assignee.full_name if t.assignee else "Unassigned",
            reporter_name=t.reporter.full_name if t.reporter else "System",
            extra_json=t.extra_json,
            labels=[JiraLabelRead(id=l.id, name=l.name, color=l.color) for l in t.labels],
            subtasks=[
                JiraSubTaskRead(
                    id=st.id,
                    parent_task_id=st.parent_task_id,
                    title=st.title,
                    is_done=st.is_done,
                    assignee_id=st.assignee_id,
                    due_date=st.due_date,
                    sort_order=st.sort_order,
                    created_at=st.created_at,
                )
                for st in t.subtasks
            ],
        )
        out.append(item)
    return out

@router.post("", response_model=JiraTaskRead, status_code=status.HTTP_201_CREATED)
async def create_jira_task(
    payload: JiraTaskCreate,
    db: AsyncSession = Depends(get_db),
):
    key = await get_next_task_key(db, "LM")
    new_task = JiraTask(
        key=key,
        title=payload.title,
        description=payload.description,
        type=payload.type,
        status=payload.status,
        priority=payload.priority,
        assignee_id=payload.assignee_id,
        reporter_id=payload.reporter_id,
        due_date=payload.due_date,
        sla_hours=payload.sla_hours,
        story_points=payload.story_points,
        category=payload.category,
        onboarding_day=payload.onboarding_day,
        extra_json=payload.extra_json,
    )
    db.add(new_task)
    await db.flush()

    # Log activity
    act = JiraActivity(
        task_id=new_task.id,
        actor_id=payload.reporter_id,
        action="task_created",
        new_value=f"Created {key}: {payload.title}",
    )
    db.add(act)

    await db.commit()
    await db.refresh(new_task)
    return await get_jira_task(new_task.id, db)

@router.get("/{task_id}", response_model=JiraTaskRead)
async def get_jira_task(task_id: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(JiraTask)
        .options(
            selectinload(JiraTask.labels),
            selectinload(JiraTask.subtasks),
            selectinload(JiraTask.assignee),
            selectinload(JiraTask.reporter),
        )
        .where(JiraTask.id == task_id)
    )
    res = await db.execute(stmt)
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    return JiraTaskRead(
        id=t.id,
        key=t.key,
        title=t.title,
        description=t.description,
        type=t.type,
        status=t.status,
        priority=t.priority,
        assignee_id=t.assignee_id,
        reporter_id=t.reporter_id,
        due_date=t.due_date,
        sla_hours=t.sla_hours,
        story_points=t.story_points,
        category=t.category,
        onboarding_day=t.onboarding_day,
        completed_at=t.completed_at,
        created_at=t.created_at,
        updated_at=t.updated_at,
        time_spent_hours=t.time_spent_hours or 0.0,
        assignee_name=t.assignee.full_name if t.assignee else "Unassigned",
        reporter_name=t.reporter.full_name if t.reporter else "System",
        labels=[JiraLabelRead(id=l.id, name=l.name, color=l.color) for l in t.labels],
        subtasks=[
            JiraSubTaskRead(
                id=st.id,
                parent_task_id=st.parent_task_id,
                title=st.title,
                is_done=st.is_done,
                assignee_id=st.assignee_id,
                due_date=st.due_date,
                sort_order=st.sort_order,
                created_at=st.created_at,
            )
            for st in t.subtasks
        ],
    )

@router.patch("/{task_id}", response_model=JiraTaskRead)
async def update_jira_task(
    task_id: str,
    payload: JiraTaskUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(JiraTask).where(JiraTask.id == task_id)
    res = await db.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    old_status = task.status
    update_data = payload.dict(exclude_unset=True)

    if "status" in update_data and update_data["status"] != old_status:
        if update_data["status"] == "done":
            task.completed_at = datetime.now(timezone.utc)
        elif old_status == "done":
            task.completed_at = None
        act = JiraActivity(
            task_id=task.id,
            action="status_transition",
            old_value=old_status,
            new_value=update_data["status"],
            note=f"Transitioned from {old_status} to {update_data['status']}",
        )
        db.add(act)

    for k, v in update_data.items():
        setattr(task, k, v)

    await db.commit()
    return await get_jira_task(task_id, db)

@router.post("/{task_id}/subtasks", response_model=JiraSubTaskRead)
async def add_subtask(
    task_id: str,
    payload: JiraSubTaskCreate,
    db: AsyncSession = Depends(get_db),
):
    sub = JiraSubTask(
        parent_task_id=task_id,
        title=payload.title,
        assignee_id=payload.assignee_id,
        due_date=payload.due_date,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return JiraSubTaskRead(
        id=sub.id,
        parent_task_id=sub.parent_task_id,
        title=sub.title,
        is_done=sub.is_done,
        assignee_id=sub.assignee_id,
        due_date=sub.due_date,
        sort_order=sub.sort_order,
        created_at=sub.created_at,
    )

@router.patch("/subtasks/{subtask_id}")
async def toggle_subtask(subtask_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(JiraSubTask).where(JiraSubTask.id == subtask_id)
    res = await db.execute(stmt)
    st = res.scalar_one_or_none()
    if not st:
        raise HTTPException(status_code=404, detail="Subtask not found")
    st.is_done = not st.is_done
    await db.commit()
    return {"id": st.id, "is_done": st.is_done}

@router.get("/{task_id}/comments", response_model=List[JiraCommentRead])
async def list_comments(task_id: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(JiraComment)
        .options(selectinload(JiraComment.author))
        .where(JiraComment.task_id == task_id)
        .order_by(JiraComment.created_at.asc())
    )
    res = await db.execute(stmt)
    comments = res.scalars().all()
    return [
        JiraCommentRead(
            id=c.id,
            task_id=c.task_id,
            author_id=c.author_id,
            author_name=c.author.full_name if c.author else "LaunchMate User",
            body=c.body,
            mentions=c.mentions,
            created_at=c.created_at,
        )
        for c in comments
    ]

@router.post("/{task_id}/comments", response_model=JiraCommentRead)
async def add_comment(
    task_id: str,
    payload: JiraCommentCreate,
    author_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    comment = JiraComment(
        task_id=task_id,
        author_id=author_id,
        body=payload.body,
        mentions=payload.mentions,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return JiraCommentRead(
        id=comment.id,
        task_id=comment.task_id,
        author_id=comment.author_id,
        author_name="You",
        body=comment.body,
        mentions=comment.mentions,
        created_at=comment.created_at,
    )


# ─── JIRA PILLAR 3: RELEASES & VERSIONS ───

@router.get("/releases/overview")
async def get_jira_releases(db: AsyncSession = Depends(get_db)):
    """Returns software versions, release readiness, and changelog breakdown."""
    return [
        {
            "id": "rel-1",
            "name": "v1.0.0 — Foundation & Enterprise SSO",
            "version": "1.0.0",
            "status": "released",
            "release_date": "2026-09-15",
            "progress_percent": 100,
            "total_issues": 18,
            "completed_issues": 18,
            "story_points": 45,
            "description": "Initial enterprise rollout: Azure Active Directory SSO, Intune compliance, and Contoso policy handbooks.",
            "release_notes": [
                "Feature: Microsoft Entra ID SAML/OIDC SSO authentication",
                "Feature: Automatic checklist provisioning for Day 1-90",
                "Fix: Resolved Intune MDM compliance check race condition on macOS Sequoia"
            ]
        },
        {
            "id": "rel-2",
            "name": "v1.1.0 — Core Microservices & CI/CD Mesh",
            "version": "1.1.0",
            "status": "in_progress",
            "release_date": "2026-11-15",
            "progress_percent": 75,
            "total_issues": 24,
            "completed_issues": 18,
            "story_points": 58,
            "description": "Microservices architecture upgrade: Kafka event streaming, Teams bot integrations, and automated build pipelines.",
            "release_notes": [
                "Feature: Microsoft Teams Delegated Graph API meeting scheduling",
                "Feature: Real-time cohort chat with channel broadcasting",
                "Improvement: RAG vector retrieval hybrid lexical scoring"
            ]
        },
        {
            "id": "rel-3",
            "name": "v2.0.0 — Zero-Trust Identity & AI Autonomous Agent",
            "version": "2.0.0",
            "status": "unreleased",
            "release_date": "2027-01-30",
            "progress_percent": 20,
            "total_issues": 40,
            "completed_issues": 8,
            "story_points": 110,
            "description": "Next-gen Autonomous AI Agent with live telephony handoff, bi-directional Jira sprint auto-grooming, and policy fine-tuning.",
            "release_notes": [
                "Feature: Multi-turn Voice Call Live Agent escalation",
                "Feature: Automated Jira Sprint Retrospective insights",
                "Security: FedRAMP High compliance telemetry enforcement"
            ]
        }
    ]


@router.post("/releases/{release_id}/deploy")
async def deploy_release(release_id: str):
    """Triggers simulated automated canary release pipeline."""
    return {
        "release_id": release_id,
        "status": "deploying",
        "pipeline_id": f"pipe-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "message": "Canary deployment initiated across staging and production clusters via ArgoCD.",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# ─── JIRA PILLAR 4: SUPPORT (JIRA SERVICE MANAGEMENT) ───

# In-memory support store for rapid interactive demo
SUPPORT_TICKETS = [
    {
        "id": "JSM-101",
        "key": "JSM-101",
        "summary": "Request Elevated Production Sandbox Access for Azure Kubernetes",
        "description": "Need contributor RBAC access to Contoso-EastUS-Aks-Prod for microservice deployment debugging.",
        "category": "Cloud & Infrastructure",
        "priority": "high",
        "status": "Waiting on Support",
        "customer": "Parth Parashar",
        "assignee": "Maanvi (People Operations Lead)",
        "created_at": "2 hours ago",
        "sla_time_left": "1h 45m",
        "sla_status": "within_sla",
        "sla_target_hours": 4
    },
    {
        "id": "JSM-102",
        "key": "JSM-102",
        "summary": "M3 MacBook Pro External 4K Display Flickering via Thunderbolt 4 Dock",
        "description": "Dell Ultrasharp U2723QE monitor drops video signal randomly during screen sharing calls.",
        "category": "Hardware & Equipment",
        "priority": "medium",
        "status": "In Progress",
        "customer": "Alex Chen",
        "assignee": "IT Support Desk",
        "created_at": "4 hours ago",
        "sla_time_left": "3h 30m",
        "sla_status": "within_sla",
        "sla_target_hours": 8
    },
    {
        "id": "JSM-103",
        "key": "JSM-103",
        "summary": "Need JetBrains All-Products Pack Enterprise License Seat Provisioning",
        "description": "Please assign a license seat for IntelliJ IDEA Ultimate and DataGrip to user corporate email.",
        "category": "Software Licensing",
        "priority": "low",
        "status": "Waiting on Customer",
        "customer": "Sarah Jenkins",
        "assignee": "IT Procurement",
        "created_at": "1 day ago",
        "sla_time_left": "18h 00m",
        "sla_status": "within_sla",
        "sla_target_hours": 24
    },
    {
        "id": "JSM-104",
        "key": "JSM-104",
        "summary": "VPN Certificate Expired on macOS Sequoia 15.3 Client",
        "description": "Cannot connect to contoso-internal.vpn. Contoso GlobalProtect displays 'Certificate Expired'.",
        "category": "Security & Network",
        "priority": "urgent",
        "status": "Escalated to Tier 2",
        "customer": "Marcus Brody",
        "assignee": "Network Security Team",
        "created_at": "30 mins ago",
        "sla_time_left": "45m",
        "sla_status": "urgent_warning",
        "sla_target_hours": 2
    }
]

@router.get("/support/tickets")
async def get_support_tickets():
    return SUPPORT_TICKETS

@router.post("/support/tickets")
async def create_support_ticket(payload: dict):
    new_ticket = {
        "id": f"JSM-{len(SUPPORT_TICKETS) + 101}",
        "key": f"JSM-{len(SUPPORT_TICKETS) + 101}",
        "summary": payload.get("summary", "New IT Support Request"),
        "description": payload.get("description", ""),
        "category": payload.get("category", "General IT"),
        "priority": payload.get("priority", "medium"),
        "status": "Waiting on Support",
        "customer": payload.get("customer", "New Employee"),
        "assignee": "IT Support Desk",
        "created_at": "Just now",
        "sla_time_left": "3h 59m",
        "sla_status": "within_sla",
        "sla_target_hours": 4
    }
    SUPPORT_TICKETS.insert(0, new_ticket)
    return new_ticket

@router.patch("/support/tickets/{ticket_id}")
async def update_support_ticket(ticket_id: str, payload: dict):
    for t in SUPPORT_TICKETS:
        if t["id"] == ticket_id or t["key"] == ticket_id:
            if "status" in payload:
                t["status"] = payload["status"]
            if "assignee" in payload:
                t["assignee"] = payload["assignee"]
            return t
    raise HTTPException(status_code=404, detail="Ticket not found")
