import asyncio
import logging
from datetime import datetime, timezone
from app.db.session import AsyncSessionLocal
from app.services.nudge_service import nudge_service
from app.services.escalation_service import escalation_service

logger = logging.getLogger("worker_jobs")
logging.basicConfig(level=logging.INFO)

async def run_overdue_scan():
    """Scheduled task scanner."""
    logger.info("Worker: Starting scheduled overdue task scan...")
    async with AsyncSessionLocal() as db:
        results = await nudge_service.scan_and_send_nudges(db)
        logger.info(f"Worker: Dispatched nudges to {len(results)} users.")
        return results

async def dispatch_escalation_job(escalation_id: str):
    """Background worker job to deliver HR notification."""
    logger.info(f"Worker: Processing background escalation job for ID: {escalation_id}")
    # Additional notification channels (SMS, PagerDuty, Teams Webhook) can be attached here
    return {"status": "dispatched", "escalation_id": escalation_id}

def run_sync_overdue_scan():
    return asyncio.run(run_overdue_scan())

def run_sync_escalation(escalation_id: str):
    return asyncio.run(dispatch_escalation_job(escalation_id))
