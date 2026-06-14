from datetime import datetime

from app.config import get_settings
from app.models.audit_log import AuditEventType
from app.models.script_request import (
    ApprovalChecklist,
    ExecutionResult,
    ScriptRequest,
    ScriptStatus,
    ValidationSeverity,
)
from app.models.server import Server
from app.models.user import User, UserRole
from app.services.audit import log_audit
from app.services.crypto import decrypt_value
from app.services.execution.factory import DatabaseExecutorFactory
from app.services.script_utils import compute_content_hash
from app.services.validation.pipeline import run_full_validation
from app.services.validation.static_rules import has_blocking_errors


def _build_connection_string(encrypted: str, database_name: str) -> str:
    conn_str = decrypt_value(encrypted)
    if database_name and "Database=" not in conn_str and "DATABASE=" not in conn_str:
        separator = ";" if not conn_str.endswith(";") else ""
        conn_str = f"{conn_str}{separator}Database={database_name}"
    return conn_str


def _to_script_dict(script: ScriptRequest) -> dict:
    return {
        "id": str(script.id),
        "submitted_by": script.submitted_by,
        "submitted_by_name": script.submitted_by_name,
        "server_id": script.server_id,
        "database_name": script.database_name,
        "database_display_name": script.database_display_name,
        "environment": script.environment,
        "tsql_content": script.tsql_content,
        "content_hash": script.content_hash,
        "status": script.status.value,
        "validation_result": [v.model_dump() for v in script.validation_result],
        "approval": script.approval.model_dump() if script.approval else None,
        "execution_result": script.execution_result.model_dump() if script.execution_result else None,
        "created_at": script.created_at,
        "validated_at": script.validated_at,
        "executed_at": script.executed_at,
    }


async def process_validation(script_id: str) -> None:
    script = await ScriptRequest.get(script_id)
    if not script or script.status != ScriptStatus.VALIDATING:
        return

    server = await Server.get(script.server_id)
    if not server:
        script.status = ScriptStatus.AUTO_REJECTED
        script.validation_result = []
        script.validated_at = datetime.utcnow()
        script.updated_at = datetime.utcnow()
        await script.save()
        return

    issues = await run_full_validation(
        script.tsql_content,
        script.database_name,
        script.environment,
        server,
    )
    script.validation_result = issues
    script.validated_at = datetime.utcnow()
    script.updated_at = datetime.utcnow()

    if has_blocking_errors(issues):
        script.status = ScriptStatus.AUTO_REJECTED
    else:
        script.status = ScriptStatus.PENDING_APPROVAL

    await script.save()
    await log_audit(
        AuditEventType.SCRIPT_AUTO_VALIDATED,
        entity_type="script_request",
        entity_id=str(script.id),
        metadata={
            "status": script.status.value,
            "errors": [i.model_dump() for i in issues if i.severity == ValidationSeverity.ERROR],
            "warnings": [i.model_dump() for i in issues if i.severity == ValidationSeverity.WARNING],
        },
    )


async def execute_approved_script(script_id: str, actor: User) -> ScriptRequest:
    settings = get_settings()
    script = await ScriptRequest.get(script_id)
    if not script:
        raise ValueError("Script não encontrado")

    if script.status != ScriptStatus.APPROVED:
        raise ValueError("Script não está no status aprovado")

    current_hash = compute_content_hash(script.tsql_content)
    if current_hash != script.content_hash:
        raise ValueError("Integridade do script comprometida")

    server = await Server.get(script.server_id)
    if not server:
        raise ValueError("Servidor não encontrado")

    revalidation = await run_full_validation(
        script.tsql_content,
        script.database_name,
        script.environment,
        server,
    )
    if has_blocking_errors(revalidation):
        script.status = ScriptStatus.EXECUTION_FAILED
        script.execution_result = ExecutionResult(
            success=False,
            error="Re-validação pré-execução falhou. Schema ou script pode ter mudado desde a aprovação.",
        )
        script.validation_result = revalidation
        script.updated_at = datetime.utcnow()
        await script.save()
        await log_audit(
            AuditEventType.SCRIPT_EXECUTION_FAILED,
            actor=actor,
            entity_type="script_request",
            entity_id=str(script.id),
            metadata={"reason": "pre_execution_revalidation_failed"},
        )
        return script

    script.status = ScriptStatus.EXECUTING
    script.updated_at = datetime.utcnow()
    await script.save()
    await log_audit(
        AuditEventType.SCRIPT_EXECUTION_STARTED,
        actor=actor,
        entity_type="script_request",
        entity_id=str(script.id),
    )

    timeout = (
        settings.execution_timeout_prod
        if script.environment == "prod"
        else settings.execution_timeout_dev
    )

    try:
        conn_str = _build_connection_string(server.encrypted_execution_connection_string, script.database_name)
        executor = DatabaseExecutorFactory.get(server.provider)
        result = await executor.execute(script.tsql_content, conn_str, timeout)

        script.execution_result = ExecutionResult(
            success=result.success,
            duration_ms=result.duration_ms,
            rows_affected=result.rows_affected,
            messages=result.messages,
            error=result.error,
            batches_executed=result.batches_executed,
        )
        script.executed_at = datetime.utcnow()
        script.updated_at = datetime.utcnow()

        if result.success:
            script.status = ScriptStatus.EXECUTED
            await log_audit(
                AuditEventType.SCRIPT_EXECUTED,
                actor=actor,
                entity_type="script_request",
                entity_id=str(script.id),
                metadata={"duration_ms": result.duration_ms, "rows_affected": result.rows_affected},
            )
        else:
            script.status = ScriptStatus.EXECUTION_FAILED
            await log_audit(
                AuditEventType.SCRIPT_EXECUTION_FAILED,
                actor=actor,
                entity_type="script_request",
                entity_id=str(script.id),
                metadata={"error": result.error},
            )
    except Exception as exc:
        script.status = ScriptStatus.EXECUTION_FAILED
        script.execution_result = ExecutionResult(success=False, error=str(exc))
        script.updated_at = datetime.utcnow()
        await log_audit(
            AuditEventType.SCRIPT_EXECUTION_FAILED,
            actor=actor,
            entity_type="script_request",
            entity_id=str(script.id),
            metadata={"error": str(exc)},
        )

    await script.save()
    return script


def can_view_script(user: User, script: ScriptRequest) -> bool:
    if user.role in (UserRole.ADMIN, UserRole.COORDINATOR):
        return True
    return script.submitted_by == str(user.id)


def can_approve_script(user: User, script: ScriptRequest) -> bool:
    if user.role not in (UserRole.ADMIN, UserRole.COORDINATOR):
        return False
    if script.status != ScriptStatus.PENDING_APPROVAL:
        return False
    if user.role == UserRole.COORDINATOR and script.submitted_by == str(user.id):
        return False
    return True
