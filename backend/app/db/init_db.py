import os
import glob
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from app.db.session import engine, AsyncSessionLocal, Base
from app.core.security import get_password_hash
from app.models.user import User
from app.models.checklist_template import ChecklistTemplate
from app.models.document import Document
from app.services.task_service import task_service
from app.services.rag_service import rag_service

logger = logging.getLogger("init_db")
logging.basicConfig(level=logging.INFO)

INITIAL_TEMPLATES = [
    # Universal Tasks (All roles & locations)
    {
        "role": "All",
        "location": "All",
        "department": "All",
        "title": "Set up Multi-Factor Authentication (MFA)",
        "description": "Download Microsoft Authenticator on your mobile device and register via https://aka.ms/mfasetup.",
        "category": "IT",
        "due_days_from_hire": 1,
        "priority": "high",
        "required": True
    },
    {
        "role": "All",
        "location": "All",
        "department": "All",
        "title": "Enroll Laptop in Microsoft Intune MDM",
        "description": "Verify disk encryption (BitLocker/FileVault) and install corporate endpoint security within 48h.",
        "category": "IT",
        "due_days_from_hire": 2,
        "priority": "high",
        "required": True
    },
    {
        "role": "All",
        "location": "All",
        "department": "All",
        "title": "Attend Virtual Welcome Orientation",
        "description": "Join the Monday 9:00 AM PST Teams session with the People & Culture executive team.",
        "category": "Training",
        "due_days_from_hire": 1,
        "priority": "high",
        "required": True
    },
    {
        "role": "All",
        "location": "All",
        "department": "All",
        "title": "Complete Mandatory Standards of Business Conduct Training",
        "description": "45-minute online interactive course on Launch Mate Learning covering compliance and anti-harassment.",
        "category": "Legal",
        "due_days_from_hire": 4,
        "priority": "high",
        "required": True
    },
    {
        "role": "All",
        "location": "All",
        "department": "All",
        "title": "Meet your Onboarding Buddy for Virtual Coffee",
        "description": "Schedule a 30-minute introductory chat to ask questions and learn about team culture.",
        "category": "Team",
        "due_days_from_hire": 3,
        "priority": "medium",
        "required": False
    },
    {
        "role": "All",
        "location": "All",
        "department": "All",
        "title": "Review Health, Dental & 401(k) Benefits Elections",
        "description": "Select your medical plan (Cigna PPO vs HDHP) and designate beneficiaries in the HR portal.",
        "category": "HR",
        "due_days_from_hire": 7,
        "priority": "high",
        "required": True
    },
    {
        "role": "All",
        "location": "All",
        "department": "All",
        "title": "Claim Home Office Ergonomic Stipend ($1,200)",
        "description": "Submit receipts for monitor, ergonomic chair, or motorized desk via SAP Concur within 60 days.",
        "category": "HR",
        "due_days_from_hire": 14,
        "priority": "low",
        "required": False
    },

    # Software Engineering Specific Tasks
    {
        "role": "Software Engineer",
        "location": "All",
        "department": "Engineering",
        "title": "Request GitHub Enterprise & Azure Subscription Access",
        "description": "Join github.com/launchmate-org using corporate SSO and register your Ed25519 SSH key.",
        "category": "IT",
        "due_days_from_hire": 2,
        "priority": "high",
        "required": True
    },
    {
        "role": "Software Engineer",
        "location": "All",
        "department": "Engineering",
        "title": "Configure Local Development Environment & Sign Commits",
        "description": "Clone repository, run Docker setup scripts, and enable GPG/SSH commit signing.",
        "category": "IT",
        "due_days_from_hire": 3,
        "priority": "high",
        "required": True
    },
    {
        "role": "Software Engineer",
        "location": "All",
        "department": "Engineering",
        "title": "Ship First Pull Request (Day-30 Milestone)",
        "description": "Pair program with your buddy and deliver your first feature commit to the staging branch.",
        "category": "Training",
        "due_days_from_hire": 25,
        "priority": "medium",
        "required": True
    },

    # Product Manager Specific Tasks
    {
        "role": "Product Manager",
        "location": "All",
        "department": "Product",
        "title": "Schedule Customer Discovery Shadowing",
        "description": "Shadow at least two enterprise customer syncs or sales demos with the Account Executive team.",
        "category": "Training",
        "due_days_from_hire": 10,
        "priority": "medium",
        "required": True
    },
    {
        "role": "Product Manager",
        "location": "All",
        "department": "Product",
        "title": "Publish First PRD / Feature Specification Draft",
        "description": "Draft product requirements for upcoming sprint milestone and share with engineering leads.",
        "category": "Training",
        "due_days_from_hire": 21,
        "priority": "high",
        "required": True
    },

    # Location-Specific Tasks
    {
        "role": "All",
        "location": "Redmond, WA",
        "department": "All",
        "title": "Collect Redmond Campus Security Badge & Parking Pass",
        "description": "Visit Building 92 Security Office to pick up your NFC badge and register vehicle.",
        "category": "General",
        "due_days_from_hire": 2,
        "priority": "medium",
        "required": True
    },
    {
        "role": "All",
        "location": "London, UK",
        "department": "All",
        "title": "Complete UK Pension Auto-Enrollment & NHS Verification",
        "description": "Confirm National Insurance details and pension contribution in the UK HR portal.",
        "category": "HR",
        "due_days_from_hire": 5,
        "priority": "high",
        "required": True
    }
]

DEMO_USERS = [
    {
        "email": "admin@microsoft.com",
        "full_name": "Elena Rostova",
        "role": "Director of People Operations",
        "department": "Human Resources",
        "location": "Redmond, WA",
        "is_admin": True,
        "password": "Password123!"
    },
    {
        "email": "346789@gmail.com",
        "full_name": "Parth parashar",
        "role": "Software Engineer",
        "department": "Engineering",
        "location": "Redmond, WA",
        "is_admin": False,
        "password": "Password123!"
    }
]

async def init_db():
    logger.info("Initializing database schema...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Seed Checklist Templates if empty
        t_res = await session.execute(select(ChecklistTemplate).limit(1))
        if not t_res.scalar_one_or_none():
            logger.info("Seeding default checklist templates...")
            for t_data in INITIAL_TEMPLATES:
                template = ChecklistTemplate(**t_data)
                session.add(template)
            await session.commit()
            logger.info(f"Seeded {len(INITIAL_TEMPLATES)} checklist templates.")

        # Seed Demo Users & generate their initial task checklists
        u_res = await session.execute(select(User).limit(1))
        if not u_res.scalar_one_or_none():
            logger.info("Seeding demo users and generating personalized checklists...")
            for u_data in DEMO_USERS:
                pw = u_data.pop("password")
                user = User(
                    **u_data,
                    hashed_password=get_password_hash(pw)
                )
                session.add(user)
                await session.flush()
                # Generate tasks for non-admin users
                if not user.is_admin:
                    await task_service.generate_tasks_for_new_joiner(session, user)
            await session.commit()
            logger.info(f"Seeded {len(DEMO_USERS)} demo users.")

        # Ingest and Index Knowledge Base Documents if empty
        d_res = await session.execute(select(Document).limit(1))
        if not d_res.scalar_one_or_none():
            logger.info("Ingesting company documents into RAG vector repository...")
            docs_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "docs")
            doc_files = sorted(glob.glob(os.path.join(docs_dir, "*.md")))

            for file_path in doc_files:
                filename = os.path.basename(file_path)
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()

                # Derive title from first line (# Title)
                lines = content.strip().split("\n")
                first_line = lines[0].lstrip("#").strip() if lines else filename
                category = "General"
                if "benefits" in filename:
                    category = "Benefits"
                elif "security" in filename or "vpn" in filename:
                    category = "IT Security"
                elif "conduct" in filename:
                    category = "Compliance & Conduct"
                elif "travel" in filename:
                    category = "Travel & Expenses"
                elif "handbook" in filename:
                    category = "Employee Handbook"
                elif "orientation" in filename:
                    category = "Orientation & Training"

                await rag_service.ingest_document(
                    db=session,
                    title=first_line,
                    category=category,
                    source_file=filename,
                    raw_text=content
                )
            logger.info("Completed RAG documentation indexing.")

        # Seed initial Jira tasks and Chat channels
        from app.models.jira_task import JiraTask, JiraTaskCounter, JiraLabel
        from app.models.jira_chat import Channel, ChannelMessage, Announcement

        ch_res = await session.execute(select(Channel).limit(1))
        if not ch_res.scalar_one_or_none():
            logger.info("Seeding Enterprise Chat channels and announcements...")
            gen_ch = Channel(name="general", description="General company discussion and cohort chats", is_announcement=False)
            ann_ch = Channel(name="announcements", description="Official HR broadcasts and leadership townhalls", is_announcement=True)
            tech_ch = Channel(name="it-support", description="Hardware provisioning, MFA setups, and VPN troubleshooting", is_announcement=False)
            session.add_all([gen_ch, ann_ch, tech_ch])
            await session.flush()

            # Add welcome announcement
            ann = Announcement(
                title="Welcome to Microsoft LaunchMate 2026 Cohort! 🚀",
                body="We are thrilled to welcome our newest engineers to the Redmond & Global engineering hub. Please complete Day-1 checklist items and join the Virtual Orientation.",
                read_by=[]
            )
            session.add(ann)

            # Seed initial Jira Board tasks
            jt_res = await session.execute(select(JiraTask).limit(1))
            if not jt_res.scalar_one_or_none():
                logger.info("Seeding Jira-grade Sprint Board tasks...")
                counter = JiraTaskCounter(project_key="LM", last_num=4)
                session.add(counter)

                t1 = JiraTask(
                    key="LM-1",
                    title="Setup Azure AD SSO & Microsoft Authenticator MFA",
                    description="Download Microsoft Authenticator on iOS/Android and enroll device via aka.ms/mfasetup.",
                    type="task",
                    status="in_progress",
                    priority="urgent",
                    sla_hours=24,
                    story_points=2,
                    onboarding_day=1,
                    category="IT",
                )
                t2 = JiraTask(
                    key="LM-2",
                    title="Hardware Provisioning: M3 MacBook Max / ThinkPad X1 Carbon",
                    description="Verify FileVault disk encryption and Intune MDM compliance policies with IT Helpdesk.",
                    type="task",
                    status="done",
                    priority="high",
                    sla_hours=48,
                    story_points=3,
                    onboarding_day=1,
                    category="IT",
                    completed_at=datetime.now(timezone.utc),
                )
                t3 = JiraTask(
                    key="LM-3",
                    title="Attend Virtual Orientation & Executive Keynote",
                    description="Join Microsoft Teams live stream with Executive Leadership and People Team.",
                    type="story",
                    status="todo",
                    priority="high",
                    sla_hours=72,
                    story_points=1,
                    onboarding_day=2,
                    category="Training",
                )
                t4 = JiraTask(
                    key="LM-4",
                    title="Code of Conduct & NDA Compliance Sign-off",
                    description="Review Standards of Business Conduct and complete digital signature in Workday.",
                    type="task",
                    status="in_review",
                    priority="medium",
                    sla_hours=96,
                    story_points=1,
                    onboarding_day=3,
                    category="Legal",
                )
                session.add_all([t1, t2, t3, t4])
            await session.commit()
            logger.info("Seeded Jira tasks and Chat channels successfully.")

if __name__ == "__main__":
    import asyncio
    asyncio.run(init_db())
