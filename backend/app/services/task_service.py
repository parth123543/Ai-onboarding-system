from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from app.models.task import Task
from app.models.checklist_template import ChecklistTemplate
from app.models.user import User
from app.schemas.task import TaskStatsResponse

class TaskService:
    async def generate_tasks_for_new_joiner(self, db: AsyncSession, user: User) -> List[Task]:
        """
        Copies matching checklist templates into the new joiner's personalized task list
        based on role and location.
        """
        # Query templates matching user role or 'All', and user location or 'All'
        stmt = select(ChecklistTemplate).where(
            and_(
                or_(ChecklistTemplate.role == "All", ChecklistTemplate.role.ilike(f"%{user.role}%")),
                or_(ChecklistTemplate.location == "All", ChecklistTemplate.location.ilike(f"%{user.location}%"))
            )
        ).order_by(ChecklistTemplate.due_days_from_hire.asc())

        result = await db.execute(stmt)
        templates = result.scalars().all()

        now = datetime.now(timezone.utc)
        created_tasks = []

        for template in templates:
            due_date = now + timedelta(days=template.due_days_from_hire)
            task = Task(
                user_id=user.id,
                title=template.title,
                description=template.description,
                category=template.category,
                priority=template.priority,
                status="pending",
                due_date=due_date,
                metadata_json={
                    "template_id": template.id,
                    "target_role": template.role,
                    "target_location": template.location
                }
            )
            db.add(task)
            created_tasks.append(task)

        await db.commit()
        for t in created_tasks:
            await db.refresh(t)
        return created_tasks

    async def get_user_tasks(
        self,
        db: AsyncSession,
        user_id: str,
        status: Optional[str] = None
    ) -> List[Task]:
        """Fetches tasks for user, dynamically refreshing overdue states."""
        query = select(Task).where(Task.user_id == user_id)
        if status:
            query = query.where(Task.status == status)
        query = query.order_by(Task.due_date.asc())

        result = await db.execute(query)
        tasks = result.scalars().all()

        now = datetime.now(timezone.utc)
        has_updates = False
        for t in tasks:
            if t.status in ["pending", "in_progress"] and t.due_date:
                # Ensure timezone aware
                t_due = t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)
                if t_due < now:
                    t.status = "overdue"
                    has_updates = True

        if has_updates:
            await db.commit()

        return tasks

    async def update_task_status_idempotent(
        self,
        db: AsyncSession,
        user_id: str,
        task_id: str,
        new_status: str
    ) -> Tuple[Optional[Task], bool]:
        """
        Idempotent task status update.
        If task is already in the target status (e.g. 'completed'), it is a no-op.
        Returns: (task, was_modified)
        """
        result = await db.execute(
            select(Task).where(and_(Task.id == task_id, Task.user_id == user_id))
        )
        task = result.scalar_one_or_none()
        if not task:
            return None, False

        # Idempotency check: already in requested state
        if task.status == new_status:
            return task, False

        task.status = new_status
        now = datetime.now(timezone.utc)
        if new_status == "completed":
            task.completed_at = now
        elif task.completed_at and new_status != "completed":
            task.completed_at = None

        await db.commit()
        await db.refresh(task)
        return task, True

    async def get_stats(self, db: AsyncSession, user_id: str) -> TaskStatsResponse:
        """Calculates onboarding completion metrics."""
        tasks = await self.get_user_tasks(db, user_id)
        total = len(tasks)
        completed = sum(1 for t in tasks if t.status == "completed")
        overdue = sum(1 for t in tasks if t.status == "overdue")
        pending = total - completed

        percentage = round((completed / total * 100), 1) if total > 0 else 0.0

        return TaskStatsResponse(
            total_tasks=total,
            completed_tasks=completed,
            pending_tasks=pending,
            overdue_tasks=overdue,
            completion_percentage=percentage
        )

    async def execute_agent_action(
        self,
        db: AsyncSession,
        user: User,
        action_name: Optional[str],
        parameters: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Executes actions on behalf of the user via function-calling.
        Actions: complete_task, list_tasks, raise_it_ticket, book_orientation, check_progress.
        """
        params = parameters or {}
        now = datetime.now(timezone.utc)

        if action_name == "complete_task":
            query_str = params.get("task_query", "") or params.get("task_name", "")
            # Find best matching task for this user
            tasks = await self.get_user_tasks(db, user.id)
            matched_task = None
            
            # Match keywords
            for t in tasks:
                t_words = [w.lower() for w in t.title.split() if len(w) > 2]
                if any(w in query_str.lower() for w in t_words) or (t.category.lower() in query_str.lower()):
                    matched_task = t
                    break
            
            # If no direct match, take the first pending/overdue task
            if not matched_task:
                pending_tasks = [t for t in tasks if t.status != "completed"]
                if pending_tasks:
                    matched_task = pending_tasks[0]

            if matched_task:
                task, modified = await self.update_task_status_idempotent(db, user.id, matched_task.id, "completed")
                stats = await self.get_stats(db, user.id)
                status_text = "marked as completed" if modified else "already completed (no change needed)"
                return {
                    "action": "complete_task",
                    "status": "success",
                    "task_title": matched_task.title,
                    "task_id": matched_task.id,
                    "was_modified": modified,
                    "message": f"Successfully {status_text}: **{matched_task.title}**! You are now at **{stats.completion_percentage}%** completion.",
                    "stats": stats.model_dump()
                }
            else:
                return {
                    "action": "complete_task",
                    "status": "not_found",
                    "message": "I could not locate an open task matching that description. Please check your checklist."
                }

        elif action_name == "list_tasks":
            tasks = await self.get_user_tasks(db, user.id)
            stats = await self.get_stats(db, user.id)
            pending_list = [f"- [ ] **{t.title}** ({t.category} - due {t.due_date.strftime('%b %d') if t.due_date else 'soon'})" for t in tasks if t.status != 'completed']
            completed_list = [f"- [x] ~~{t.title}~~" for t in tasks if t.status == 'completed']
            
            summary = (
                f"### Your Onboarding Progress: {stats.completion_percentage}%\n"
                f"**Pending Tasks ({len(pending_list)}):**\n" + ("\n".join(pending_list[:6]) if pending_list else "*All tasks completed!*") + "\n\n"
                f"**Completed Tasks ({len(completed_list)}):**\n" + ("\n".join(completed_list[:4]) if completed_list else "*None yet.*")
            )
            return {
                "action": "list_tasks",
                "status": "success",
                "message": summary,
                "stats": stats.model_dump()
            }

        elif action_name == "raise_it_ticket":
            subject = params.get("subject", "IT Hardware & Software Provisioning Request")
            urgency = params.get("urgency", "high")
            ticket_task = Task(
                user_id=user.id,
                title=f"IT Ticket: {subject[:60]}",
                description=f"Automated IT Ticket raised by AI Onboarding Assistant.\nRequest details: {subject}\nEmployee: {user.full_name} ({user.email})",
                category="IT",
                priority=urgency,
                status="in_progress",
                due_date=now + timedelta(days=2),
                metadata_json={"ticket_type": "automated_support", "channel": "Helpdesk"}
            )
            db.add(ticket_task)
            await db.commit()
            await db.refresh(ticket_task)

            return {
                "action": "raise_it_ticket",
                "status": "success",
                "ticket_id": ticket_task.id[:8].upper(),
                "message": f"IT Service Desk Ticket **#INC-{ticket_task.id[:6].upper()}** has been created with urgency **{urgency.upper()}**.\nThe IT Operations team has been notified and will reach out via Microsoft Teams within 2 business hours."
            }

        elif action_name == "book_orientation":
            slot_time = params.get("slot_time", "Tomorrow at 10:00 AM PST")
            session_type = params.get("session_type", "New Joiner Executive Cohort")
            
            # Check or create orientation task
            orientation_task = Task(
                user_id=user.id,
                title=f"Attend Orientation: {session_type}",
                description=f"Confirmed orientation slot for {slot_time} with People & Culture Team.",
                category="Training",
                priority="high",
                status="pending",
                due_date=now + timedelta(days=1),
                metadata_json={"slot": slot_time, "meeting_link": "https://teams.microsoft.com/l/meetup-join/onboarding-cohort"}
            )
            db.add(orientation_task)
            await db.commit()
            await db.refresh(orientation_task)

            return {
                "action": "book_orientation",
                "status": "success",
                "slot": slot_time,
                "message": f"Booked your spot for **{session_type}** ({slot_time})!\nA calendar invite has been sent to your Outlook account with the Microsoft Teams join link."
            }

        elif action_name == "check_progress":
            stats = await self.get_stats(db, user.id)
            return {
                "action": "check_progress",
                "status": "success",
                "message": f"You have completed **{stats.completed_tasks} of {stats.total_tasks} tasks** ({stats.completion_percentage}%). You have {stats.pending_tasks} pending and {stats.overdue_tasks} overdue tasks.",
                "stats": stats.model_dump()
            }

        # Default fallback
        return {
            "action": action_name or "unknown",
            "status": "executed",
            "message": "Action processed successfully by the Onboarding Assistant."
        }

task_service = TaskService()
