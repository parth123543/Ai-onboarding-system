from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.schemas.task import (
    TaskResponse,
    TaskCreate,
    TaskUpdate,
    TaskStatusUpdate,
    TaskStatsResponse
)
from app.services.task_service import task_service

router = APIRouter()

@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    status: Optional[str] = Query(None, description="Filter by status: pending, in_progress, completed, overdue"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    tasks = await task_service.get_user_tasks(db, current_user.id, status=status)
    return [TaskResponse.model_validate(t) for t in tasks]

@router.get("/stats", response_model=TaskStatsResponse)
async def get_task_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    return await task_service.get_stats(db, current_user.id)

@router.post("", response_model=TaskResponse)
async def create_task(
    task_in: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    task = Task(
        user_id=current_user.id,
        title=task_in.title,
        description=task_in.description,
        category=task_in.category,
        priority=task_in.priority,
        due_date=task_in.due_date,
        status="pending"
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)

@router.patch("/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: str,
    status_update: TaskStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Idempotent task status update.
    Marking an already-completed task 'completed' again is a safe no-op.
    """
    task, _ = await task_service.update_task_status_idempotent(
        db,
        user_id=current_user.id,
        task_id=task_id,
        new_status=status_update.status
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found or access denied"
        )
    return TaskResponse.model_validate(task)

@router.post("/regenerate", response_model=List[TaskResponse])
async def regenerate_user_checklist(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Regenerates tasks from checklist templates based on role + location."""
    tasks = await task_service.generate_tasks_for_new_joiner(db, current_user)
    return [TaskResponse.model_validate(t) for t in tasks]
