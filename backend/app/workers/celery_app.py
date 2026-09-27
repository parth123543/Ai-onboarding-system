from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "onboarding_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "daily-overdue-tasks-scan": {
            "task": "app.workers.celery_app.scheduled_nudge_scan_task",
            "schedule": 86400.0,  # Once every 24 hours
        }
    }
)

@celery_app.task
def scheduled_nudge_scan_task():
    from app.workers.jobs import run_sync_overdue_scan
    return run_sync_overdue_scan()

@celery_app.task
def async_escalation_alert_task(escalation_id: str):
    from app.workers.jobs import run_sync_escalation
    return run_sync_escalation(escalation_id)
