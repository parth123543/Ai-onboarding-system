"""
Jira-grade Task Management Models
Includes: Tasks, SubTasks, TaskDependencies, TaskComments, WorkLogs, TaskLabels, TaskAttachments
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Text, JSON,
    Boolean, Integer, Float, Table
)
from sqlalchemy.orm import relationship
from app.db.session import Base


def gen_uuid() -> str:
    return uuid.uuid4().hex


# Many-to-many: task labels
task_label_association = Table(
    "jira_task_label_map",
    Base.metadata,
    Column("task_id", String(36), ForeignKey("jira_tasks.id", ondelete="CASCADE")),
    Column("label_id", String(36), ForeignKey("jira_labels.id", ondelete="CASCADE")),
)


class JiraTask(Base):
    __tablename__ = "jira_tasks"

    id = Column(String(36), primary_key=True, default=gen_uuid, index=True)
    key = Column(String(20), unique=True, index=True)        # e.g. LM-42
    project_key = Column(String(20), nullable=False, default="LM")

    # Core fields
    title = Column(String(512), nullable=False)
    description = Column(Text, nullable=True)               # Markdown supported
    type = Column(String(30), nullable=False, default="task")  # task | bug | story | epic
    status = Column(String(30), nullable=False, default="todo", index=True)
    # todo | in_progress | in_review | done | cancelled | blocked

    priority = Column(String(20), nullable=False, default="medium")
    # urgent | high | medium | low

    # People
    reporter_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assignee_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Epic / Parent
    epic_id = Column(String(36), ForeignKey("jira_tasks.id", ondelete="SET NULL"), nullable=True)

    # Dates & SLA
    due_date = Column(DateTime(timezone=True), nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    sla_hours = Column(Integer, nullable=True)               # SLA deadline in hours from created_at
    overdue_notified = Column(Boolean, default=False)

    # Estimation & tracking
    story_points = Column(Integer, nullable=True)
    original_estimate_hours = Column(Float, nullable=True)
    time_spent_hours = Column(Float, default=0.0)
    time_remaining_hours = Column(Float, nullable=True)

    # Flags
    is_milestone = Column(Boolean, default=False)
    mandatory = Column(Boolean, default=True)

    # Onboarding-specific
    onboarding_day = Column(Integer, nullable=True)         # Day 1 / 30 / 60 / 90
    category = Column(String(50), nullable=True)            # IT | HR | Legal | Training | Team

    # Metadata
    extra_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    reporter = relationship("User", foreign_keys=[reporter_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
    epic = relationship("JiraTask", remote_side=[id], foreign_keys=[epic_id], backref="stories")
    subtasks = relationship("JiraSubTask", back_populates="parent_task", cascade="all, delete-orphan")
    comments = relationship("JiraComment", back_populates="task", cascade="all, delete-orphan", order_by="JiraComment.created_at")
    work_logs = relationship("JiraWorkLog", back_populates="task", cascade="all, delete-orphan")
    labels = relationship("JiraLabel", secondary=task_label_association, back_populates="tasks")
    attachments = relationship("JiraAttachment", back_populates="task", cascade="all, delete-orphan")
    # Dependencies (this task blocks others / is blocked by others)
    blocking = relationship(
        "JiraTaskDependency",
        foreign_keys="JiraTaskDependency.blocker_id",
        back_populates="blocker",
        cascade="all, delete-orphan",
    )
    blocked_by = relationship(
        "JiraTaskDependency",
        foreign_keys="JiraTaskDependency.blocked_id",
        back_populates="blocked",
        cascade="all, delete-orphan",
    )
    activity_feed = relationship("JiraActivity", back_populates="task", cascade="all, delete-orphan", order_by="JiraActivity.created_at.desc()")


class JiraSubTask(Base):
    __tablename__ = "jira_subtasks"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    parent_task_id = Column(String(36), ForeignKey("jira_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(512), nullable=False)
    is_done = Column(Boolean, default=False)
    assignee_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    parent_task = relationship("JiraTask", back_populates="subtasks")
    assignee = relationship("User", foreign_keys=[assignee_id])


class JiraTaskDependency(Base):
    __tablename__ = "jira_task_dependencies"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    blocker_id = Column(String(36), ForeignKey("jira_tasks.id", ondelete="CASCADE"), nullable=False)
    blocked_id = Column(String(36), ForeignKey("jira_tasks.id", ondelete="CASCADE"), nullable=False)
    dep_type = Column(String(30), default="blocks")  # blocks | relates_to | duplicates | is_child_of
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    blocker = relationship("JiraTask", foreign_keys=[blocker_id], back_populates="blocking")
    blocked = relationship("JiraTask", foreign_keys=[blocked_id], back_populates="blocked_by")


class JiraComment(Base):
    __tablename__ = "jira_comments"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    task_id = Column(String(36), ForeignKey("jira_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body = Column(Text, nullable=False)  # Markdown
    mentions = Column(JSON, nullable=True)  # list of user IDs mentioned
    edited = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    task = relationship("JiraTask", back_populates="comments")
    author = relationship("User", foreign_keys=[author_id])


class JiraWorkLog(Base):
    __tablename__ = "jira_work_logs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    task_id = Column(String(36), ForeignKey("jira_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    hours = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    logged_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task = relationship("JiraTask", back_populates="work_logs")
    user = relationship("User", foreign_keys=[user_id])


class JiraLabel(Base):
    __tablename__ = "jira_labels"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(80), unique=True, nullable=False)
    color = Column(String(20), default="#6366f1")  # hex color
    tasks = relationship("JiraTask", secondary=task_label_association, back_populates="labels")


class JiraAttachment(Base):
    __tablename__ = "jira_attachments"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    task_id = Column(String(36), ForeignKey("jira_tasks.id", ondelete="CASCADE"), nullable=False)
    uploader_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    filename = Column(String(255), nullable=False)
    file_url = Column(String(1024), nullable=False)  # Supabase Storage URL
    file_size_bytes = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task = relationship("JiraTask", back_populates="attachments")
    uploader = relationship("User", foreign_keys=[uploader_id])


class JiraActivity(Base):
    """Immutable audit log of every state change on a task."""
    __tablename__ = "jira_activity"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    task_id = Column(String(36), ForeignKey("jira_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(80), nullable=False)         # status_changed | comment_added | assignee_changed …
    old_value = Column(String(255), nullable=True)
    new_value = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    task = relationship("JiraTask", back_populates="activity_feed")
    actor = relationship("User", foreign_keys=[actor_id])


class JiraSprintBoard(Base):
    __tablename__ = "jira_sprint_boards"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(120), nullable=False)               # e.g. "Week 1 Onboarding Sprint"
    goal = Column(Text, nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class JiraTaskCounter(Base):
    """Atomic counter for generating LM-1, LM-2 … keys."""
    __tablename__ = "jira_task_counter"

    project_key = Column(String(20), primary_key=True, default="LM")
    last_num = Column(Integer, default=0, nullable=False)
