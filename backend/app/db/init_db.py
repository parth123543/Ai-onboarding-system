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
        "description": "45-minute online interactive course on Contoso Learning covering compliance and anti-harassment.",
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
        "description": "Join github.com/contoso-org using corporate SSO and register your Ed25519 SSH key.",
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
        "email": "sarah.chen@microsoft.com",
        "full_name": "Sarah Chen",
        "role": "Software Engineer",
        "department": "Engineering",
        "location": "Redmond, WA",
        "is_admin": False,
        "password": "Password123!"
    },
    {
        "email": "alex.rivera@microsoft.com",
        "full_name": "Alex Rivera",
        "role": "Product Manager",
        "department": "Product & AI",
        "location": "London, UK",
        "is_admin": False,
        "password": "Password123!"
    },
    {
        "email": "priya.sharma@microsoft.com",
        "full_name": "Priya Sharma",
        "role": "Software Engineer",
        "department": "Core AI & Search",
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

if __name__ == "__main__":
    import asyncio
    asyncio.run(init_db())
