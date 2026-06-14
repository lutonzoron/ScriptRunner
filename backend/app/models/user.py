from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document, Indexed
from pydantic import EmailStr, Field


class UserRole(str, Enum):
    ADMIN = "admin"
    COORDINATOR = "coordinator"
    USER = "user"


class User(Document):
    email: Indexed(EmailStr, unique=True)
    name: str
    password_hash: str
    role: UserRole = UserRole.USER
    active: bool = True
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None
    token_version: int = 0
    must_change_password: bool = False
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"
