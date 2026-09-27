# Import all the models, so that Base has them before being
# imported by Alembic or database init
from app.db.session import Base
from app.models.user import User
from app.models.checklist_template import ChecklistTemplate
from app.models.task import Task
from app.models.chat_message import ChatMessage
from app.models.escalation import Escalation
from app.models.document import Document, DocumentChunk
from app.models.nudge import NudgeRecord
