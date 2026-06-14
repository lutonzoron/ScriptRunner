from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import Field

from app.models.script_request import ApprovalChecklist


class BundleStatus(str, Enum):
    VALIDATING = "validating"
    AUTO_REJECTED = "auto_rejected"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    EXECUTING = "executing"
    EXECUTED = "executed"
    EXECUTION_FAILED = "execution_failed"
    MANUALLY_REJECTED = "manually_rejected"


class ScriptBundle(Document):
    submitted_by: str
    submitted_by_name: str
    title: str
    demand_reference: str
    pr_url: str
    server_ids: list[str]
    server_names: list[str] = Field(default_factory=list)
    database_name: str
    environment: str
    status: BundleStatus = BundleStatus.VALIDATING
    approval: Optional[ApprovalChecklist] = None
    script_count: int
    server_count: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    validated_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "script_bundles"
