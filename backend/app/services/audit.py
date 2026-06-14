from datetime import datetime
from typing import Any, Optional

from fastapi import Request

from app.models.audit_log import AuditEventType, AuditLog
from app.models.user import User


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def log_audit(
    event_type: AuditEventType,
    actor: Optional[User] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
    actor_email: Optional[str] = None,
) -> AuditLog:
    entry = AuditLog(
        event_type=event_type,
        actor_id=str(actor.id) if actor else None,
        actor_email=actor.email if actor else actor_email,
        actor_role=actor.role.value if actor else None,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata or {},
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent") if request else None,
        timestamp=datetime.utcnow(),
    )
    await entry.insert()
    return entry
