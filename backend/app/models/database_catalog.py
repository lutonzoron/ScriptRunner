from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import Field

from app.models.user import UserRole


class Environment(str, Enum):
    DEV = "dev"
    HOMOLOG = "homolog"
    PROD = "prod"


class DatabaseCatalog(Document):
    server_id: str
    display_name: str
    database_name: str
    environment: Environment = Environment.DEV
    allowed_roles: list[UserRole] = Field(default_factory=lambda: [UserRole.USER, UserRole.COORDINATOR, UserRole.ADMIN])
    allowed_user_ids: list[str] = Field(default_factory=list)
    active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "databases"
