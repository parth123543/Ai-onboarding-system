from typing import List, Any, Dict
import random
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserLogin,
    UserResponse,
    Token,
    OAuthLoginRequest,
    PhoneOtpSendRequest,
    PhoneOtpVerifyRequest,
    CompleteProfileRequest
)
from app.services.task_service import task_service

router = APIRouter()

# In-memory OTP cache for demo verification (production connects to Redis/Twilio)
OTP_STORE: Dict[str, str] = {}

@router.post("/login", response_model=Token)
async def login(
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Standard email + password login."""
    result = await db.execute(select(User).where(User.email == login_data.email.lower()))
    user = result.scalar_one_or_none()
    
    if not user or not user.hashed_password or not verify_password(login_data.password, user.hashed_password):
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

@router.post("/signup", response_model=Token)
async def signup(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Employee self-registration.
    Collects full name, email, password, role, department, location.
    Instantly generates their personalized onboarding checklist based on role & location!
    """
    result = await db.execute(select(User).where(User.email == user_in.email.lower()))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An employee account with this email already exists. Please log in."
        )
    
    user = User(
        email=user_in.email.lower(),
        full_name=user_in.full_name,
        role=user_in.role or "Software Engineer",
        department=user_in.department or "Engineering",
        location=user_in.location or "Redmond, WA",
        phone_number=user_in.phone_number,
        auth_provider="email",
        microsoft_id=f"{user_in.email.lower()}#microsoft",
        is_admin=user_in.is_admin,
        hashed_password=get_password_hash(user_in.password or "Password123!")
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Immediately populate their personalized checklist based on role & location
    await task_service.generate_tasks_for_new_joiner(db, user)

    # Auto-login token
    access_token = create_access_token(subject=user.id)
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.post("/oauth", response_model=Token)
async def oauth_login(
    req: OAuthLoginRequest,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    One-click authentication via Google or Microsoft (Entra ID).
    Auto-provisions employee record and generates matching checklist if first time.
    """
    email_clean = req.email.lower()
    result = await db.execute(select(User).where(User.email == email_clean))
    user = result.scalar_one_or_none()

    if not user:
        # Create new employee via OAuth
        user = User(
            email=email_clean,
            full_name=req.full_name,
            role=req.role or "Software Engineer",
            department=req.department or "Engineering",
            location=req.location or "Redmond, WA",
            auth_provider=req.provider,
            microsoft_id=f"{email_clean}#microsoft" if req.provider == "microsoft" else None,
            is_admin=False,
            hashed_password=None
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Generate checklist tasks
        await task_service.generate_tasks_for_new_joiner(db, user)
    else:
        # Update provider if needed
        if req.provider == "microsoft" and not user.microsoft_id:
            user.microsoft_id = f"{email_clean}#microsoft"
            await db.commit()

    access_token = create_access_token(subject=user.id)
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.post("/phone/send-otp")
async def send_phone_otp(req: PhoneOtpSendRequest) -> Any:
    """Sends 6-digit SMS verification code to phone number."""
    phone = req.phone_number.strip().replace(" ", "").replace("-", "")
    # Generate 6-digit OTP code (default demo code 123456 is always accepted)
    otp = str(random.randint(100000, 999999))
    OTP_STORE[phone] = otp
    return {
        "status": "otp_sent",
        "phone_number": phone,
        "demo_code": "123456",
        "message": f"Verification code sent to {phone}. (Use demo code 123456 or {otp})"
    }

@router.post("/phone/verify-otp", response_model=Token)
async def verify_phone_otp(
    req: PhoneOtpVerifyRequest,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Verifies phone OTP and logs employee in or creates account."""
    phone = req.phone_number.strip().replace(" ", "").replace("-", "")
    stored_otp = OTP_STORE.get(phone)

    # Accept either stored OTP or universal hackathon test code 123456
    if req.otp_code != "123456" and req.otp_code != stored_otp:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Check if user exists by phone
    result = await db.execute(select(User).where(User.phone_number == phone))
    user = result.scalar_one_or_none()

    if not user:
        # Auto-create user from phone
        synthetic_email = f"user.{phone[-4:]}@launchmate.microsoft.com"
        user = User(
            email=synthetic_email,
            full_name=req.full_name or "Mobile Joiner",
            role=req.role or "Software Engineer",
            department=req.department or "Engineering",
            location=req.location or "Redmond, WA",
            phone_number=phone,
            auth_provider="phone",
            microsoft_id=f"{synthetic_email}#microsoft",
            is_admin=False
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Generate checklist
        await task_service.generate_tasks_for_new_joiner(db, user)

    access_token = create_access_token(subject=user.id)
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.post("/complete-profile", response_model=UserResponse)
async def complete_profile(
    req: CompleteProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Updates role & location and generates matching personalized tasks."""
    current_user.role = req.role
    current_user.department = req.department
    current_user.location = req.location
    await db.commit()
    await db.refresh(current_user)

    # Regenerate checklist for the new role & location
    await task_service.generate_tasks_for_new_joiner(db, current_user)
    return UserResponse.model_validate(current_user)

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> Any:
    return UserResponse.model_validate(current_user)

@router.get("/demo-users", response_model=List[UserResponse])
async def get_demo_users(db: AsyncSession = Depends(get_db)) -> Any:
    """Returns available users for quick switching."""
    result = await db.execute(select(User).order_by(User.is_admin.desc(), User.created_at.desc()))
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]

class QuickSwitchRequest(BaseModel):
    user_id: str

@router.post("/quick-switch", response_model=Token)
async def quick_switch(req: QuickSwitchRequest, db: AsyncSession = Depends(get_db)) -> Any:
    """Generates an authentic access token for any demo/registered user for rapid persona switching."""
    result = await db.execute(select(User).where(User.id == req.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    access_token = create_access_token(subject=user.id)
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )
