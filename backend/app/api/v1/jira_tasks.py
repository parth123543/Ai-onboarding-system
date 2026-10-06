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
