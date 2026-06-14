from datetime import datetime
from enum import Enum
from typing import Any, Optional

from beanie import Document
from pydantic import BaseModel, Field


class ScriptStatus(str, Enum):
    VALIDATING = "validating"
    AUTO_REJECTED = "auto_rejected"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    EXECUTING = "executing"
    EXECUTED = "executed"
    EXECUTION_FAILED = "execution_failed"
    MANUALLY_REJECTED = "manually_rejected"


class ValidationSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"


class ValidationIssue(BaseModel):
    code: str
    severity: ValidationSeverity
    message: str
    line: Optional[int] = None


class ApprovalChecklist(BaseModel):
    checked_environment: bool = False
    checked_tsql: bool = False
    checked_where_clause: bool = False
    checked_impact: bool = False
    checked_timing: bool = False
    checked_auto_validation: bool = False
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    self_approved: bool = False
    rejection_reason: Optional[str] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None


class ExecutionResult(BaseModel):
    success: bool = False
    duration_ms: Optional[int] = None
    rows_affected: Optional[int] = None
    messages: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    batches_executed: int = 0


class ScriptRequest(Document):
    submitted_by: str
    submitted_by_name: str
    server_id: str
    database_name: str
    database_display_name: str
    environment: str
    tsql_content: str
    content_hash: str
    status: ScriptStatus = ScriptStatus.VALIDATING
    validation_result: list[ValidationIssue] = Field(default_factory=list)
    approval: Optional[ApprovalChecklist] = None
    execution_result: Optional[ExecutionResult] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    validated_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "script_requests"
