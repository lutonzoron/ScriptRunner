import asyncio
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.dependencies import require_full_access, require_roles
from app.config import get_settings
from app.models.audit_log import AuditEventType
from app.models.script_bundle import BundleStatus, ScriptBundle
from app.models.script_request import ApprovalChecklist, ScriptRequest, ScriptStatus
from app.models.server import Server
from app.models.user import User, UserRole
from app.schemas import ApprovalRequest, DashboardStats, ScriptResubmit, ScriptResponse, ScriptSubmit
from app.services.audit import log_audit
from app.services.script_service import (
    _to_script_dict,
    can_approve_script,
    can_view_script,
    execute_approved_script,
    process_validation,
    resubmit_script,
)
from app.services.script_utils import compute_content_hash

router = APIRouter(prefix="/scripts", tags=["scripts"])

_submit_counts: dict[str, list[datetime]] = {}


def _check_submit_rate(user_id: str) -> None:
    settings = get_settings()
    now = datetime.utcnow()
    window_start = now - timedelta(hours=1)
    timestamps = _submit_counts.get(user_id, [])
    timestamps = [t for t in timestamps if t > window_start]
    if len(timestamps) >= settings.script_submit_rate_per_hour:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Limite de submissões por hora atingido.",
        )
    timestamps.append(now)
    _submit_counts[user_id] = timestamps


def _script_response(script: ScriptRequest) -> ScriptResponse:
    data = _to_script_dict(script)
    return ScriptResponse(**data)


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(user: User = Depends(require_full_access)):
    if user.role in (UserRole.ADMIN, UserRole.COORDINATOR):
        pending_scripts = await ScriptRequest.find(
            ScriptRequest.status == ScriptStatus.PENDING_APPROVAL,
            ScriptRequest.bundle_id == None,
        ).count()
        pending_bundles = await ScriptBundle.find(
            ScriptBundle.status == BundleStatus.PENDING_APPROVAL
        ).count()
        pending = pending_scripts + pending_bundles
    else:
        pending = 0

    my_scripts = await ScriptRequest.find(
        ScriptRequest.submitted_by == str(user.id),
        ScriptRequest.bundle_id == None,
    ).count()
    my_bundles = await ScriptBundle.find(
        ScriptBundle.submitted_by == str(user.id)
    ).count()
    recent_executed = await ScriptRequest.find(
        ScriptRequest.status == ScriptStatus.EXECUTED,
        ScriptRequest.bundle_id == None,
    ).count()
    recent_executed += await ScriptBundle.find(
        ScriptBundle.status == BundleStatus.EXECUTED
    ).count()
    recent_failed = await ScriptRequest.find(
        ScriptRequest.status == ScriptStatus.EXECUTION_FAILED,
        ScriptRequest.bundle_id == None,
    ).count()
    recent_failed += await ScriptBundle.find(
        ScriptBundle.status == BundleStatus.EXECUTION_FAILED
    ).count()

    return DashboardStats(
        pending_approvals=pending,
        my_scripts=my_scripts,
        my_bundles=my_bundles,
        recent_executed=recent_executed,
        recent_failed=recent_failed,
    )


@router.get("", response_model=list[ScriptResponse])
async def list_scripts(user: User = Depends(require_full_access)):
    if user.role in (UserRole.ADMIN, UserRole.COORDINATOR):
        scripts = (
            await ScriptRequest.find(ScriptRequest.bundle_id == None)
            .sort(-ScriptRequest.created_at)
            .to_list()
        )
    else:
        scripts = (
            await ScriptRequest.find(
                ScriptRequest.submitted_by == str(user.id),
                ScriptRequest.bundle_id == None,
            )
            .sort(-ScriptRequest.created_at)
            .to_list()
        )
    return [_script_response(s) for s in scripts]


@router.get("/pending", response_model=list[ScriptResponse])
async def list_pending(user: User = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINATOR))):
    scripts = (
        await ScriptRequest.find(
            ScriptRequest.status == ScriptStatus.PENDING_APPROVAL,
            ScriptRequest.bundle_id == None,
        )
        .sort(-ScriptRequest.created_at)
        .to_list()
    )
    return [_script_response(s) for s in scripts]


@router.get("/{script_id}", response_model=ScriptResponse)
async def get_script(script_id: str, user: User = Depends(require_full_access)):
    script = await ScriptRequest.get(script_id)
    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada")
    if not can_view_script(user, script):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")
    return _script_response(script)


@router.post("", response_model=ScriptResponse, status_code=status.HTTP_201_CREATED)
async def submit_script(
    body: ScriptSubmit,
    request: Request,
    user: User = Depends(require_full_access),
):
    _check_submit_rate(str(user.id))

    server = await Server.get(body.server_id)
    if not server or not server.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor não encontrado")

    script = ScriptRequest(
        submitted_by=str(user.id),
        submitted_by_name=user.name,
        server_id=str(server.id),
        database_name=body.database_name,
        database_display_name=f"{body.database_name} — {server.name}",
        environment="dev",
        tsql_content=body.tsql_content,
        content_hash=compute_content_hash(body.tsql_content),
        status=ScriptStatus.VALIDATING,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await script.insert()

    await log_audit(
        AuditEventType.SCRIPT_SUBMITTED,
        actor=user,
        entity_type="script_request",
        entity_id=str(script.id),
        metadata={
            "server_id": str(server.id),
            "database_name": body.database_name,
            "database_display_name": script.database_display_name,
            "environment": script.environment,
            "content_hash": script.content_hash,
        },
        request=request,
    )

    asyncio.create_task(process_validation(str(script.id)))
    return _script_response(script)


@router.post("/{script_id}/approve", response_model=ScriptResponse)
async def approve_script(
    script_id: str,
    body: ApprovalRequest,
    request: Request,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINATOR)),
):
    script = await ScriptRequest.get(script_id)
    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada")

    if not can_approve_script(user, script):
        if script.submitted_by == str(user.id) and user.role == UserRole.COORDINATOR:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Coordenador não pode aprovar o próprio script.",
            )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Não pode aprovar esta solicitação")

    if script.status != ScriptStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Solicitação não está pendente de aprovação")

    if not body.approve:
        if not body.rejection_reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Motivo de rejeição obrigatório")
        script.status = ScriptStatus.MANUALLY_REJECTED
        script.approval = ApprovalChecklist(
            rejection_reason=body.rejection_reason,
            rejected_by=str(user.id),
            rejected_at=datetime.utcnow(),
        )
        script.updated_at = datetime.utcnow()
        await script.save()
        await log_audit(
            AuditEventType.SCRIPT_REJECTED,
            actor=user,
            entity_type="script_request",
            entity_id=str(script.id),
            metadata={"reason": body.rejection_reason},
            request=request,
        )
        return _script_response(script)

    required_checks = [
        body.checked_environment,
        body.checked_tsql,
        body.checked_where_clause,
        body.checked_impact,
        body.checked_timing,
        body.checked_auto_validation,
    ]
    if not all(required_checks):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Todos os itens do checklist devem ser confirmados para aprovar.",
        )

    self_approved = script.submitted_by == str(user.id)
    script.status = ScriptStatus.APPROVED
    script.approval = ApprovalChecklist(
        checked_environment=body.checked_environment,
        checked_tsql=body.checked_tsql,
        checked_where_clause=body.checked_where_clause,
        checked_impact=body.checked_impact,
        checked_timing=body.checked_timing,
        checked_auto_validation=body.checked_auto_validation,
        approved_by=str(user.id),
        approved_by_name=user.name,
        approved_at=datetime.utcnow(),
        self_approved=self_approved,
    )
    script.updated_at = datetime.utcnow()
    await script.save()

    await log_audit(
        AuditEventType.SCRIPT_APPROVED,
        actor=user,
        entity_type="script_request",
        entity_id=str(script.id),
        metadata={"self_approved": self_approved},
        request=request,
    )

    script = await execute_approved_script(str(script.id), user)
    return _script_response(script)


@router.post("/{script_id}/resubmit", response_model=ScriptResponse)
async def resubmit_script_endpoint(
    script_id: str,
    body: ScriptResubmit,
    request: Request,
    user: User = Depends(require_full_access),
):
    _check_submit_rate(str(user.id))

    script = await ScriptRequest.get(script_id)
    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada")

    try:
        script = await resubmit_script(script_id, user, body.tsql_content)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await log_audit(
        AuditEventType.SCRIPT_RESUBMITTED,
        actor=user,
        entity_type="script_request",
        entity_id=str(script.id),
        metadata={"content_hash": script.content_hash},
        request=request,
    )

    return _script_response(script)
