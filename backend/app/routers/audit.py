import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.auth.dependencies import require_full_access, require_roles
from app.models.audit_log import AuditEventType, AuditLog
from app.models.user import User, UserRole
from app.schemas import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["audit"])

COORDINATOR_EVENTS = {
    AuditEventType.SCRIPT_SUBMITTED,
    AuditEventType.SCRIPT_AUTO_VALIDATED,
    AuditEventType.SCRIPT_APPROVED,
    AuditEventType.SCRIPT_REJECTED,
    AuditEventType.SCRIPT_EXECUTION_STARTED,
    AuditEventType.SCRIPT_EXECUTED,
    AuditEventType.SCRIPT_EXECUTION_FAILED,
    AuditEventType.AUTH_LOGIN,
    AuditEventType.AUTH_LOGOUT,
}


def _to_response(log: AuditLog) -> AuditLogResponse:
    return AuditLogResponse(
        id=str(log.id),
        event_type=log.event_type.value,
        actor_id=log.actor_id,
        actor_email=log.actor_email,
        actor_role=log.actor_role,
        entity_type=log.entity_type,
        entity_id=log.entity_id,
        metadata=log.metadata,
        ip=log.ip,
        timestamp=log.timestamp,
    )


@router.get("", response_model=list[AuditLogResponse])
async def list_audit_logs(
    event_type: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    limit: int = Query(100, le=500),
    user: User = Depends(require_full_access),
):
    query = {}

    if user.role == UserRole.USER:
        query["actor_id"] = str(user.id)
    elif user.role == UserRole.COORDINATOR:
        pass

    if event_type:
        query["event_type"] = event_type
    if actor_id and user.role == UserRole.ADMIN:
        query["actor_id"] = actor_id
    if entity_id:
        query["entity_id"] = entity_id

    logs_query = AuditLog.find(query if query else {})

    if user.role == UserRole.COORDINATOR:
        logs = await logs_query.sort(-AuditLog.timestamp).limit(limit * 3).to_list()
        logs = [l for l in logs if l.event_type in COORDINATOR_EVENTS][:limit]
    else:
        logs = await logs_query.sort(-AuditLog.timestamp).limit(limit).to_list()

    if from_date:
        logs = [l for l in logs if l.timestamp >= from_date]
    if to_date:
        logs = [l for l in logs if l.timestamp <= to_date]

    return [_to_response(l) for l in logs]


@router.get("/export")
async def export_audit_csv(
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINATOR)),
    limit: int = Query(1000, le=5000),
):
    logs_query = AuditLog.find({})
    logs = await logs_query.sort(-AuditLog.timestamp).limit(limit).to_list()

    if user.role == UserRole.COORDINATOR:
        logs = [l for l in logs if l.event_type in COORDINATOR_EVENTS]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "event_type", "actor_email", "actor_role", "entity_type", "entity_id", "ip", "metadata"])
    for log in logs:
        writer.writerow([
            log.timestamp.isoformat(),
            log.event_type.value,
            log.actor_email or "",
            log.actor_role or "",
            log.entity_type or "",
            log.entity_id or "",
            log.ip or "",
            str(log.metadata),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )
