from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.database_catalog import Environment
from app.models.script_request import ScriptStatus, ValidationIssue
from app.models.server import DatabaseProvider
from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=8)
    role: UserRole = UserRole.USER


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)
    role: Optional[UserRole] = None
    active: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    active: bool
    must_change_password: bool = False
    created_at: datetime

    @classmethod
    def from_document(cls, user) -> "UserResponse":
        return cls(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            active=user.active,
            must_change_password=getattr(user, "must_change_password", False),
            created_at=user.created_at,
        )


class ServerCreate(BaseModel):
    name: str
    host: str
    validation_connection_string: str
    execution_connection_string: str
    provider: DatabaseProvider = DatabaseProvider.SQLSERVER


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    validation_connection_string: Optional[str] = None
    execution_connection_string: Optional[str] = None
    provider: Optional[DatabaseProvider] = None
    active: Optional[bool] = None


class ServerResponse(BaseModel):
    id: str
    name: str
    host: str
    provider: DatabaseProvider
    active: bool
    created_at: datetime


class ServerDatabaseResponse(BaseModel):
    name: str


class ConnectionTestRequest(BaseModel):
    connection_string: str = Field(min_length=1)


class ConnectionTestResponse(BaseModel):
    success: bool
    message: str
    duration_ms: int


class DatabaseCreate(BaseModel):
    server_id: str
    display_name: str
    database_name: str
    environment: Environment = Environment.DEV
    allowed_roles: list[UserRole] = Field(
        default_factory=lambda: [UserRole.USER, UserRole.COORDINATOR, UserRole.ADMIN]
    )
    allowed_user_ids: list[str] = Field(default_factory=list)


class DatabaseUpdate(BaseModel):
    display_name: Optional[str] = None
    database_name: Optional[str] = None
    environment: Optional[Environment] = None
    allowed_roles: Optional[list[UserRole]] = None
    allowed_user_ids: Optional[list[str]] = None
    active: Optional[bool] = None


class DatabaseResponse(BaseModel):
    id: str
    server_id: str
    display_name: str
    database_name: str
    environment: Environment
    allowed_roles: list[UserRole]
    allowed_user_ids: list[str]
    active: bool
    server_name: Optional[str] = None
    provider: Optional[DatabaseProvider] = None


class ScriptSubmit(BaseModel):
    server_id: str
    database_name: str = Field(min_length=1)
    tsql_content: str = Field(min_length=1)


class BundleScriptItem(BaseModel):
    tsql_content: str = Field(min_length=1)


class BundleSubmit(BaseModel):
    title: str = Field(min_length=1)
    demand_reference: str = Field(min_length=1)
    pr_url: str = Field(min_length=1)
    server_ids: list[str] = Field(min_length=1)
    database_name: str = Field(min_length=1)
    scripts: list[BundleScriptItem] = Field(min_length=1)


class ScriptResubmit(BaseModel):
    tsql_content: str = Field(min_length=1)


class BundleResubmit(BaseModel):
    title: Optional[str] = None
    demand_reference: Optional[str] = None
    pr_url: Optional[str] = None
    scripts: list[BundleScriptItem] = Field(min_length=1)


class ApprovalRequest(BaseModel):
    checked_environment: bool
    checked_tsql: bool
    checked_where_clause: bool
    checked_impact: bool
    checked_timing: bool
    checked_auto_validation: bool
    approve: bool = True
    rejection_reason: Optional[str] = None


class ScriptResponse(BaseModel):
    id: str
    submitted_by: str
    submitted_by_name: str
    bundle_id: Optional[str] = None
    script_sequence: int = 0
    server_sequence: int = 0
    server_id: str
    database_name: str
    database_display_name: str
    environment: str
    tsql_content: str
    content_hash: str
    status: ScriptStatus
    validation_result: list[ValidationIssue]
    approval: Optional[dict] = None
    execution_result: Optional[dict] = None
    created_at: datetime
    validated_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None


class BundleResponse(BaseModel):
    id: str
    submitted_by: str
    submitted_by_name: str
    title: str
    demand_reference: str
    pr_url: str
    server_ids: list[str]
    server_names: list[str]
    database_name: str
    environment: str
    status: str
    approval: Optional[dict] = None
    script_count: int
    server_count: int
    scripts: list[ScriptResponse] = Field(default_factory=list)
    created_at: datetime
    validated_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None


class AuditLogResponse(BaseModel):
    id: str
    event_type: str
    actor_id: Optional[str]
    actor_email: Optional[str]
    actor_role: Optional[str]
    entity_type: Optional[str]
    entity_id: Optional[str]
    metadata: dict
    ip: Optional[str]
    timestamp: datetime


class DashboardStats(BaseModel):
    pending_approvals: int
    my_scripts: int
    my_bundles: int
    recent_executed: int
    recent_failed: int
