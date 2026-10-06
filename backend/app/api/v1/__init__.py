from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.chat import router as chat_router
from app.api.v1.admin import router as admin_router
from app.api.v1.support import router as support_router
from app.api.v1.jira_tasks import router as jira_tasks_router
from app.api.v1.enterprise_chat import router as enterprise_chat_router
from app.api.v1.teams import router as teams_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["Tasks & Checklist"])
api_router.include_router(chat_router, prefix="/chat", tags=["Chatbot & Agent Router"])
api_router.include_router(admin_router, prefix="/admin", tags=["HR & Admin Portal"])
api_router.include_router(support_router, prefix="/support", tags=["Live Agent Support"])
api_router.include_router(jira_tasks_router, prefix="/jira/tasks", tags=["Jira Task Engine"])
api_router.include_router(enterprise_chat_router, prefix="/enterprise-chat", tags=["Enterprise Chat & Announcements"])
api_router.include_router(teams_router, prefix="/teams", tags=["Microsoft Teams & Meetings"])
