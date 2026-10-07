import logging
import hashlib
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.config import settings
from app.models.call_request import CallRequest
from app.models.user import User

logger = logging.getLogger(__name__)

class LiveAgentCallService:
    def __init__(self):
        # In-memory runtime override if user updates phone numbers during session
        self._custom_phones: Dict[str, str] = {}

    def get_lines(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "line_1",
                "agent_name": "Maanvi",
                "role": "Senior HR & People Partner",
                "department": "Human Resources",
                "specialty": "Payroll, Benefits, Leave, Visa, Company Policies",
                "phone_number": self._custom_phones.get("line_1", settings.SUPPORT_PHONE_1),
                "avatar": "M",
                "status": "Available Now",
                "wait_time": "< 1 min",
                "direct_extension": "101"
            },
            {
                "id": "line_2",
                "agent_name": "Marcus Vance",
                "role": "Lead IT Infrastructure & Security Specialist",
                "department": "IT Operations",
                "specialty": "Azure Dev Subscriptions, MFA, VPN, Laptop Provisioning",
                "phone_number": self._custom_phones.get("line_2", settings.SUPPORT_PHONE_2),
                "avatar": "MV",
                "status": "Available Now",
                "wait_time": "< 1 min",
                "direct_extension": "102"
            },
            {
                "id": "line_3",
                "agent_name": "David Reynolds",
                "role": "Global Mobility & Onboarding Coordinator",
                "department": "Global Operations",
                "specialty": "Badge Access, Office Logistics, Relocation, Hardware Dispatch",
                "phone_number": self._custom_phones.get("line_3", settings.SUPPORT_PHONE_3),
                "avatar": "DR",
                "status": "Available Now",
                "wait_time": "< 1 min",
                "direct_extension": "103"
            }
        ]

    def update_phone_number(self, line_id: str, new_phone: str) -> bool:
        if line_id in ["line_1", "line_2", "line_3"]:
            self._custom_phones[line_id] = new_phone
            logger.info(f"Updated support line {line_id} to {new_phone}")
            return True
        return False

    def assign_line_for_user(self, user: Optional[User] = None, topic: Optional[str] = None) -> Dict[str, Any]:
        lines = self.get_lines()

        # If topic indicates IT, route to line 2 (Marcus)
        if topic:
            t_lower = topic.lower()
            if any(k in t_lower for k in ["it", "vpn", "mfa", "azure", "laptop", "hardware", "software", "permission"]):
                return lines[1]
            if any(k in t_lower for k in ["badge", "office", "desk", "location", "relocation", "travel"]):
                return lines[2]
            if any(k in t_lower for k in ["hr", "benefit", "payroll", "salary", "insurance", "leave", "w-4"]):
                return lines[0]

        # Route by user department / role if present
        if user and user.department and "Engineering" in user.department:
            return lines[1]
        
        # Consistent deterministic assignment per user
        user_identifier = user.id if user and user.id else "anonymous-guest"
        h = int(hashlib.md5(user_identifier.encode()).hexdigest(), 16)
        assigned_idx = h % len(lines)
        return lines[assigned_idx]

    async def log_call_request(
        self,
        db: AsyncSession,
        user: Optional[User],
        phone_number: str,
        topic: str,
        call_type: str = "callback",
        notes: Optional[str] = None
    ) -> CallRequest:
        assigned_line = self.assign_line_for_user(user, topic=topic)

        record = CallRequest(
            user_id=user.id if user else None,
            phone_number=phone_number,
            assigned_line_id=assigned_line["id"],
            assigned_agent_name=assigned_line["agent_name"],
            assigned_phone_number=assigned_line["phone_number"],
            topic=topic,
            notes=notes,
            status="initiated",
            call_type=call_type
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)

        caller_name = user.full_name if user else "Guest Caller"
        logger.info(
            f"Logged call request #{record.id}: User {caller_name} assigned to "
            f"{assigned_line['agent_name']} ({assigned_line['phone_number']}) via {call_type}"
        )
        return record

    async def get_recent_calls(self, db: AsyncSession, limit: int = 50) -> List[CallRequest]:
        stmt = select(CallRequest).order_by(desc(CallRequest.created_at)).limit(limit)
        res = await db.execute(stmt)
        return list(res.scalars().all())

call_service = LiveAgentCallService()
