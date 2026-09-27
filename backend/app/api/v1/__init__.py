from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.chat import router as chat_router
from app.api.v1.admin import router as admin_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["Tasks & Checklist"])
api_router.include_router(chat_router, prefix="/chat", tags=["Chatbot & Agent Router"])
api_router.include_router(admin_router, prefix="/admin", tags=["HR & Admin Portal"])
