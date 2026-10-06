from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "Software Engineer"
    department: str = "Engineering"
    location: str = "Redmond, WA"
    experience_level: str = "Mid-Level"  # Junior, Mid-Level, Senior, Lead, Executive
    organization_id: str = "launchmate"
    is_admin: bool = False
    phone_number: Optional[str] = None
    auth_provider: str = "email"
    microsoft_id: Optional[str] = None

class UserCreate(UserBase):
    password: Optional[str] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    experience_level: Optional[str] = None
    is_admin: Optional[bool] = None
    phone_number: Optional[str] = None
    password: Optional[str] = None

class UserResponse(UserBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None

class OAuthLoginRequest(BaseModel):
    provider: str  # google, microsoft
    email: EmailStr
    full_name: str
    provider_user_id: Optional[str] = None
    role: Optional[str] = "Software Engineer"
    department: Optional[str] = "Engineering"
    location: Optional[str] = "Redmond, WA"
    experience_level: Optional[str] = "Mid-Level"

class PhoneOtpSendRequest(BaseModel):
    phone_number: str

class PhoneOtpVerifyRequest(BaseModel):
    phone_number: str
    otp_code: str
    full_name: Optional[str] = "Employee"
    role: Optional[str] = "Software Engineer"
    department: Optional[str] = "Engineering"
    location: Optional[str] = "Redmond, WA"
    experience_level: Optional[str] = "Mid-Level"

class CompleteProfileRequest(BaseModel):
    role: str
    department: str
    location: str
    experience_level: Optional[str] = "Mid-Level"
