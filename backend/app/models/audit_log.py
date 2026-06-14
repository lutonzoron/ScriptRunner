from datetime import datetime
from enum import Enum
from typing import Any, Optional

from beanie import Document
from pydantic import Field


class AuditEventType(str, Enum):
    AUTH_LOGIN = "AUTH_LOGIN"
    AUTH_LOGIN_FAILED = "AUTH_LOGIN_FAILED"
    AUTH_LOGOUT = "AUTH_LOGOUT"
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    USER_DEACTIVATED = "USER_DEACTIVATED"
    SERVER_CREATED = "SERVER_CREATED"
    SERVER_UPDATED = "SERVER_UPDATED"
    DATABASE_CREATED = "DATABASE_CREATED"
    DATABASE_UPDATED = "DATABASE_UPDATED"
    SCRIPT_SUBMITTED = "SCRIPT_SUBMITTED"
    SCRIPT_AUTO_VALIDATED = "SCRIPT_AUTO_VALIDATED"
    SCRIPT_APPROVED = "SCRIPT_APPROVED"
    SCRIPT_REJECTED = "SCRIPT_REJECTED"
    SCRIPT_EXECUTION_STARTED = "SCRIPT_EXECUTION_STARTED"
    SCRIPT_EXECUTED = "SCRIPT_EXECUTED"
    SCRIPT_EXECUTION_FAILED = "SCRIPT_EXECUTION_FAILED"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"


class AuditLog(Document):
    event_type: AuditEventType
    actor_id: Optional[str] = None
    actor_email: Optional[str] = None
    actor_role: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "audit_logs"
