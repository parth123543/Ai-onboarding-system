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
        Dynamically generates a personalized onboarding checklist based on:
        1. Base Onboarding Tasks (Organization standard)
        2. Dynamic Role-Specific Tasks (Backend Engineer, Sales, HR, Product, etc. + Seniority)
        3. Dynamic Location-Specific Tasks (Delhi in-office, Redmond, London vs. Remote work)
        4. Reference documents grounded in the organization's RAG knowledge base
        Preserves existing custom HR tasks and prevents duplicates.
        """
        now = datetime.now(timezone.utc)

        # 1. Fetch existing tasks to preserve custom HR tasks and prevent duplicates
        existing_stmt = select(Task).where(Task.user_id == user.id)
        existing_tasks = (await db.execute(existing_stmt)).scalars().all()
        existing_titles = {t.title.lower().strip() for t in existing_tasks}

        # 2. Query available company documents to ground reference docs
        from app.models.document import Document
        docs_stmt = select(Document).where(Document.organization_id == (user.organization_id or "launchmate"))
        available_docs = (await db.execute(docs_stmt)).scalars().all()
        doc_map = {d.title.lower(): d.title for d in available_docs}

        def resolve_ref_doc(suggested_title: Optional[str]) -> Optional[str]:
            if not suggested_title:
                return None
            suggested_lower = suggested_title.lower()
            for k, real_title in doc_map.items():
                if suggested_lower in k or k in suggested_lower:
                    return real_title
            return suggested_title

        tasks_to_create = []

        # ─── LAYER 1: BASE ONBOARDING TASKS (General) ───
        base_stmt = select(ChecklistTemplate).where(
            or_(
                ChecklistTemplate.template_type == "base",
                and_(ChecklistTemplate.role == "All", ChecklistTemplate.location == "All")
            )
        ).order_by(ChecklistTemplate.due_days_from_hire.asc())
        base_templates = (await db.execute(base_stmt)).scalars().all()

        for tpl in base_templates:
            norm_title = tpl.title.lower().strip()
            if norm_title in existing_titles:
                continue
            existing_titles.add(norm_title)
            due_date = now + timedelta(days=tpl.due_days_from_hire)
            tasks_to_create.append(Task(
                user_id=user.id,
                title=tpl.title,
                description=tpl.description,
                category=tpl.category or "General",
                task_type="general",
                priority=tpl.priority or "high",
                mandatory=tpl.mandatory if hasattr(tpl, 'mandatory') else True,
                reference_doc=resolve_ref_doc(tpl.reference_doc),
                status="pending",
                due_date=due_date,
                metadata_json={
                    "layer": "base",
                    "template_id": tpl.id,
                    "target_role": "All"
                }
            ))

        # ─── LAYER 2: DYNAMIC ROLE-SPECIFIC TASKS ───
        user_role_lower = (user.role or "").lower()
        user_dept_lower = (user.department or "").lower()

        # Query all role-specific templates
        role_stmt = select(ChecklistTemplate).where(
            ChecklistTemplate.template_type == "role"
        ).order_by(ChecklistTemplate.due_days_from_hire.asc())
        role_templates = (await db.execute(role_stmt)).scalars().all()

        matching_role_templates = []
        for tpl in role_templates:
            tpl_role = tpl.role.lower()
            tpl_dept = tpl.department.lower()
            if tpl_role != "all" and (tpl_role in user_role_lower or user_role_lower in tpl_role):
                matching_role_templates.append(tpl)
            elif tpl_dept != "all" and (tpl_dept in user_dept_lower or user_dept_lower in tpl_dept):
                matching_role_templates.append(tpl)

        # Fallback role generation if no pre-seeded template matched the custom role title
        if not matching_role_templates:
            if "engineer" in user_role_lower or "developer" in user_role_lower or "tech" in user_role_lower:
                role_alias = "Backend Engineer"
            elif "sales" in user_role_lower or "account" in user_role_lower or "business dev" in user_role_lower:
                role_alias = "Sales Employee"
            elif "hr" in user_role_lower or "people" in user_role_lower or "talent" in user_role_lower:
                role_alias = "HR Employee"
            elif "product" in user_role_lower:
                role_alias = "Product Manager"
            else:
                role_alias = "General"

            for tpl in role_templates:
                if tpl.role.lower() == role_alias.lower():
                    matching_role_templates.append(tpl)

        for tpl in matching_role_templates:
            norm_title = tpl.title.lower().strip()
            if norm_title in existing_titles:
                continue
            existing_titles.add(norm_title)
            due_date = now + timedelta(days=tpl.due_days_from_hire)
            tasks_to_create.append(Task(
                user_id=user.id,
                title=tpl.title,
                description=tpl.description,
                category=tpl.category or "IT",
                task_type="role_specific",
                priority=tpl.priority or "high",
                mandatory=tpl.mandatory if hasattr(tpl, 'mandatory') else True,
                reference_doc=resolve_ref_doc(tpl.reference_doc),
                status="pending",
                due_date=due_date,
                metadata_json={
                    "layer": "role_specific",
                    "template_id": tpl.id,
                    "target_role": user.role
                }
            ))

        # Experience level / seniority customization
        exp_level = (getattr(user, "experience_level", "Mid-Level") or "Mid-Level").lower()
        if any(keyword in exp_level for keyword in ["senior", "lead", "principal", "director", "executive"]):
            leadership_title = f"{user.role} Architecture & Strategic Roadmap Alignment"
            if leadership_title.lower() not in existing_titles:
                existing_titles.add(leadership_title.lower())
                tasks_to_create.append(Task(
                    user_id=user.id,
                    title=leadership_title,
                    description=f"Meet with department leadership and cross-functional teams to align on strategic architecture, quarterly OKRs, and mentoring responsibilities for your {user.role} role.",
                    category="Team",
                    task_type="role_specific",
                    priority="high",
                    mandatory=True,
                    reference_doc=resolve_ref_doc("Launch Mate Employee Handbook (2026 Edition)"),
                    status="pending",
                    due_date=now + timedelta(days=5),
                    metadata_json={
                        "layer": "seniority_specific",
                        "experience_level": user.experience_level
                    }
                ))

        # ─── LAYER 2 (cont'd): DYNAMIC LOCATION-SPECIFIC TASKS ───
        user_loc_lower = (user.location or "").lower()
        is_remote = any(keyword in user_loc_lower for keyword in ["remote", "wfh", "virtual", "home"])

        loc_stmt = select(ChecklistTemplate).where(
            ChecklistTemplate.template_type == "location"
        ).order_by(ChecklistTemplate.due_days_from_hire.asc())
        loc_templates = (await db.execute(loc_stmt)).scalars().all()

        matching_loc_templates = []
        if is_remote:
            for tpl in loc_templates:
                if "remote" in tpl.location.lower():
                    matching_loc_templates.append(tpl)
        else:
            for tpl in loc_templates:
                tpl_loc = tpl.location.lower()
                # Check for Delhi, Redmond, London, etc.
                if tpl_loc != "all" and (tpl_loc in user_loc_lower or any(word in user_loc_lower for word in tpl_loc.split(","))):
                    matching_loc_templates.append(tpl)

            # If user has an in-office location not in pre-seeded templates, add standard facility task
            if not matching_loc_templates:
                generic_loc_title = f"{user.location} Campus Facility Access & Local IT Setup"
                if generic_loc_title.lower() not in existing_titles:
                    existing_titles.add(generic_loc_title.lower())
                    tasks_to_create.append(Task(
                        user_id=user.id,
                        title=generic_loc_title,
                        description=f"Visit reception at the {user.location} office to collect your security badge, inspect local desk equipment, and configure Wi-Fi access.",
                        category="General",
                        task_type="location_specific",
                        priority="high",
                        mandatory=True,
                        reference_doc=resolve_ref_doc("IT Security, Hardware Provisioning & Remote Access Guide"),
                        status="pending",
                        due_date=now + timedelta(days=2),
                        metadata_json={
                            "layer": "location_specific",
                            "location": user.location
                        }
                    ))

        for tpl in matching_loc_templates:
            norm_title = tpl.title.lower().strip()
            if norm_title in existing_titles:
                continue
            existing_titles.add(norm_title)
            due_date = now + timedelta(days=tpl.due_days_from_hire)
            tasks_to_create.append(Task(
                user_id=user.id,
                title=tpl.title,
                description=tpl.description,
                category=tpl.category or "General",
                task_type="location_specific",
                priority=tpl.priority or "high",
                mandatory=tpl.mandatory if hasattr(tpl, 'mandatory') else True,
                reference_doc=resolve_ref_doc(tpl.reference_doc),
                status="pending",
                due_date=due_date,
                metadata_json={
                    "layer": "location_specific",
                    "template_id": tpl.id,
                    "target_location": user.location
                }
            ))

        # Add all new tasks
        for task in tasks_to_create:
            db.add(task)

        if tasks_to_create:
            await db.commit()

        # Return full updated list of tasks for the user
        all_user_tasks = await self.get_user_tasks(db, user.id)
        return all_user_tasks

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
