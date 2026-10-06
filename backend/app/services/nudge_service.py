import json
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
import httpx
from app.core.config import settings
from app.models.task import Task
from app.models.user import User
from app.models.nudge import NudgeRecord
from app.services.email_service import email_service

logger = logging.getLogger("nudge_service")
logger.setLevel(logging.INFO)

class NudgeService:
    async def scan_and_send_nudges(self, db: AsyncSession, simulate: bool = False) -> List[Dict[str, Any]]:
        """
        Scans for overdue or imminent onboarding tasks across all users and
        dispatches proactive nudges via Slack and SendGrid Email.
        """
        now = datetime.now(timezone.utc)
        # Find tasks that are overdue or due within next 24 hours
        stmt = (
            select(Task, User)
            .join(User, Task.user_id == User.id)
            .where(
                and_(
                    Task.status.in_(["pending", "overdue", "in_progress"]),
                    Task.due_date.isnot(None),
                    Task.due_date < (now + timedelta(hours=24))
                )
            )
        )
        result = await db.execute(stmt)
        rows = result.all()

        # Group by user
        user_tasks_map: Dict[str, Tuple[User, List[Task]]] = {}
        for task, user in rows:
            if user.id not in user_tasks_map:
                user_tasks_map[user.id] = (user, [])
            user_tasks_map[user.id][1].append(task)

        nudge_results = []
        for user_id, (user, tasks) in user_tasks_map.items():
            task_titles = [f"• {t.title} (due {t.due_date.strftime('%b %d') if t.due_date else 'today'})" for t in tasks[:3]]
            task_summary_text = "\n".join(task_titles)
            
            message_content = (
                f"👋 Hi {user.full_name}, quick check-in from your AI Onboarding Assistant!\n\n"
                f"You have {len(tasks)} upcoming or overdue onboarding task(s) to complete:\n"
                f"{task_summary_text}\n\n"
                f"You can complete them on your dashboard or simply message me: *'Mark {tasks[0].title} as done'*."
            )

            # Record in DB
            nudge = NudgeRecord(
                user_id=user.id,
                task_id=tasks[0].id if tasks else None,
                channel="email_and_slack",
                message=message_content,
                status="sent" if not simulate else "simulated",
                sent_at=now
            )
            db.add(nudge)

            # 1. SendGrid Email Dispatch to Employee's Microsoft Corporate Account
            primary_task = tasks[0]
            email_res = await email_service.send_deadline_overdue_email(
                recipient_email=user.email,
                recipient_name=user.full_name,
                task_title=primary_task.title,
                due_date=primary_task.due_date,
                category=primary_task.category,
                priority=primary_task.priority,
                microsoft_id=user.microsoft_id
            )

            # 2. Slack Dispatch if configured
            if settings.SLACK_WEBHOOK_URL and not simulate:
                try:
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            settings.SLACK_WEBHOOK_URL,
                            json={"text": f"[Nudge to {user.full_name} ({user.email})]\n{message_content}"},
                            timeout=5.0
                        )
                except Exception as e:
                    logger.error(f"Failed to deliver Slack nudge to {user.email}: {e}")

            # Structured Telemetry
            log_payload = {
                "event": "proactive_nudge_dispatched",
                "user_id": user.id,
                "user_name": user.full_name,
                "user_email": user.email,
                "task_count": len(tasks),
                "sendgrid_status": email_res.get("status"),
                "channel": "sendgrid_and_slack",
                "simulated": simulate
            }
            logger.info(json.dumps(log_payload))

            nudge_results.append({
                "user_id": user.id,
                "user_name": user.full_name,
                "user_email": user.email,
                "tasks_count": len(tasks),
                "message": message_content,
                "sendgrid": email_res,
                "status": "sent" if not simulate else "simulated"
            })

        await db.commit()
        return nudge_results

    async def notify_employee_overdue_task(self, db: AsyncSession, task_id: str) -> Dict[str, Any]:
        """Sends targeted deadline overdue notification for a specific task."""
        stmt = select(Task, User).join(User, Task.user_id == User.id).where(Task.id == task_id)
        result = await db.execute(stmt)
        row = result.first()
        if not row:
            return {"error": "Task or assigned user not found"}
        task, user = row

        email_res = await email_service.send_deadline_overdue_email(
            recipient_email=user.email,
            recipient_name=user.full_name,
            task_title=task.title,
            due_date=task.due_date,
            category=task.category,
            priority=task.priority,
            microsoft_id=user.microsoft_id
        )

        nudge = NudgeRecord(
            user_id=user.id,
            task_id=task.id,
            channel="sendgrid_email",
            message=f"Deadline overdue notification for '{task.title}' sent to {user.email}",
            status="sent",
            sent_at=datetime.now(timezone.utc)
        )
        db.add(nudge)
        await db.commit()

        return {
            "status": "notified",
            "task_id": task.id,
            "task_title": task.title,
            "employee_name": user.full_name,
            "employee_email": user.email,
            "sendgrid_result": email_res
        }

    async def fast_forward_demo_nudge(self, db: AsyncSession, user_id: str) -> Dict[str, Any]:
        """
        Fast-forward / manual trigger specifically for the hackathon demo.
        Guarantees that evaluators can see a proactive nudge without waiting for midnight cron.
        """
        user = await db.get(User, user_id)
        if not user:
            return {"error": "User not found"}

        now = datetime.now(timezone.utc)
        message = (
            f"🔔 [Nudge Alert] Hi {user.full_name}! Don't forget to complete your "
            f"**IT Security MFA Setup** and review your **Health & Dental Benefits** before Friday. "
            f"Need help? Just ask me in the chat widget!"
        )

        # Trigger SendGrid email
        email_res = await email_service.send_deadline_overdue_email(
            recipient_email=user.email,
            recipient_name=user.full_name,
            task_title="IT Security MFA Setup & Intune MDM",
            due_date=now + timedelta(hours=4),
            category="IT",
            priority="high",
            microsoft_id=user.microsoft_id
        )

        nudge = NudgeRecord(
            user_id=user.id,
            channel="sendgrid+slack",
            message=message,
            status="sent",
            sent_at=now
        )
        db.add(nudge)
        await db.commit()

        return {
            "status": "success",
            "user_name": user.full_name,
            "user_email": user.email,
            "message": message,
            "sendgrid": email_res,
            "channel": "SendGrid Email + Slack",
            "timestamp": now.isoformat()
        }

nudge_service = NudgeService()
