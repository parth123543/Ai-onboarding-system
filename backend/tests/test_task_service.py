import pytest
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services.task_service import task_service

@pytest.mark.asyncio
async def test_personalized_checklist_and_idempotency():
    async with AsyncSessionLocal() as db:
        # Fetch demo joiner Sarah Chen (Software Engineer, Redmond)
        res = await db.execute(select(User).where(User.email == "sarah.chen@microsoft.com"))
        user = res.scalar_one_or_none()
        assert user is not None

        tasks = await task_service.get_user_tasks(db, user.id)
        assert len(tasks) > 0
        
        # Verify role-specific tasks are present (e.g. GitHub Enterprise for Software Engineer)
        titles = [t.title for t in tasks]
        assert any("GitHub" in t or "MFA" in t for t in titles)

        # Pick first task and test idempotent completion
        first_task = tasks[0]
        original_status = first_task.status

        # Mark completed first time
        updated_task, modified = await task_service.update_task_status_idempotent(db, user.id, first_task.id, "completed")
        assert updated_task.status == "completed"
        assert updated_task.completed_at is not None

        # Mark completed second time -> MUST be no-op (modified is False)
        updated_again, modified_second_time = await task_service.update_task_status_idempotent(db, user.id, first_task.id, "completed")
        assert updated_again.status == "completed"
        assert modified_second_time is False

        # Verify stats calculation
        stats = await task_service.get_stats(db, user.id)
        assert stats.total_tasks > 0
        assert stats.completed_tasks >= 1
        assert 0.0 <= stats.completion_percentage <= 100.0

@pytest.mark.asyncio
async def test_agent_actions_execution():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == "sarah.chen@microsoft.com"))
        user = res.scalar_one()

        # Action 1: Raise IT Ticket
        ticket_res = await task_service.execute_agent_action(
            db=db,
            user=user,
            action_name="raise_it_ticket",
            parameters={"subject": "Need extra 4K Dell monitor for desk", "urgency": "medium"}
        )
        assert ticket_res["status"] == "success"
        assert "INC-" in ticket_res["message"]

        # Action 2: Book Orientation
        booking_res = await task_service.execute_agent_action(
            db=db,
            user=user,
            action_name="book_orientation",
            parameters={"slot_time": "Thursday at 2:00 PM PST", "session_type": "Executive Q&A"}
        )
        assert booking_res["status"] == "success"
        assert "Thursday" in booking_res["message"]
