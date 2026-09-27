from typing import List, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token
from app.services.task_service import task_service

router = APIRouter()

@router.post("/login", response_model=Token)
async def login(
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
) -> Any:
    result = await db.execute(select(User).where(User.email == login_data.email.lower()))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    access_token = create_access_token(subject=user.id)
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.post("/register", response_model=UserResponse)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db)
) -> Any:
    result = await db.execute(select(User).where(User.email == user_in.email.lower()))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists"
        )
    
    user = User(
        email=user_in.email.lower(),
        full_name=user_in.full_name,
        role=user_in.role,
        department=user_in.department,
        location=user_in.location,
        is_admin=user_in.is_admin,
        hashed_password=get_password_hash(user_in.password)
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Automatically generate personalized checklist tasks based on role + location
    await task_service.generate_tasks_for_new_joiner(db, user)

    return UserResponse.model_validate(user)

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> Any:
    return UserResponse.model_validate(current_user)

@router.get("/demo-users", response_model=List[UserResponse])
async def get_demo_users(db: AsyncSession = Depends(get_db)) -> Any:
    """Returns available pre-seeded demo users for rapid testing in UI."""
    result = await db.execute(select(User).order_by(User.is_admin.desc(), User.full_name.asc()))
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]
