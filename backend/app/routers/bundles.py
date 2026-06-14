from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.dependencies import require_full_access, require_roles
from app.models.audit_log import AuditEventType
from app.models.script_bundle import BundleStatus, ScriptBundle
from app.models.script_request import ApprovalChecklist
from app.models.user import User, UserRole
from app.routers.scripts import _check_submit_rate
from app.schemas import ApprovalRequest, BundleResubmit, BundleResponse, BundleSubmit, ScriptResponse
from app.services.audit import log_audit
from app.services.bundle_service import (
    approve_bundle,
    can_approve_bundle,
    can_view_bundle,
    get_bundle_response,
    resubmit_bundle,
    submit_bundle,
)

router = APIRouter(prefix="/bundles", tags=["bundles"])


def _bundle_response(data: dict) -> BundleResponse:
    scripts = [ScriptResponse(**s) for s in data.get("scripts", [])]
    return BundleResponse(**{k: v for k, v in data.items() if k != "scripts"}, scripts=scripts)


@router.get("", response_model=list[BundleResponse])
async def list_bundles(user: User = Depends(require_full_access)):
    if user.role in (UserRole.ADMIN, UserRole.COORDINATOR):
        bundles = await ScriptBundle.find_all().sort(-ScriptBundle.created_at).to_list()
    else:
        bundles = (
            await ScriptBundle.find(ScriptBundle.submitted_by == str(user.id))
            .sort(-ScriptBundle.created_at)
            .to_list()
        )

    results = []
    for bundle in bundles:
        data = await get_bundle_response(str(bundle.id))
        results.append(_bundle_response(data))
    return results


@router.get("/pending", response_model=list[BundleResponse])
async def list_pending_bundles(
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINATOR)),
):
    bundles = (
        await ScriptBundle.find(ScriptBundle.status == BundleStatus.PENDING_APPROVAL)
        .sort(-ScriptBundle.created_at)
        .to_list()
    )
    return [_bundle_response(await get_bundle_response(str(b.id))) for b in bundles]


@router.get("/{bundle_id}", response_model=BundleResponse)
async def get_bundle(bundle_id: str, user: User = Depends(require_full_access)):
    bundle = await ScriptBundle.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pacote não encontrado")
    if not can_view_bundle(user, bundle):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")
    return _bundle_response(await get_bundle_response(bundle_id))


@router.post("", response_model=BundleResponse, status_code=status.HTTP_201_CREATED)
async def create_bundle(
    body: BundleSubmit,
    request: Request,
    user: User = Depends(require_full_access),
):
    _check_submit_rate(str(user.id))

    if len(body.scripts) == 1 and len(body.server_ids) == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use submissão avulsa para 1 script em 1 servidor.",
        )

    try:
        bundle = await submit_bundle(
            user=user,
            title=body.title,
            demand_reference=body.demand_reference,
            pr_url=body.pr_url,
            server_ids=body.server_ids,
            database_name=body.database_name,
            scripts=[s.tsql_content for s in body.scripts],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await log_audit(
        AuditEventType.BUNDLE_SUBMITTED,
        actor=user,
        entity_type="script_bundle",
        entity_id=str(bundle.id),
        metadata={
            "title": bundle.title,
            "demand_reference": bundle.demand_reference,
            "pr_url": bundle.pr_url,
            "server_ids": bundle.server_ids,
            "database_name": bundle.database_name,
            "script_count": bundle.script_count,
            "server_count": bundle.server_count,
        },
        request=request,
    )

    return _bundle_response(await get_bundle_response(str(bundle.id)))


@router.post("/{bundle_id}/approve", response_model=BundleResponse)
async def approve_bundle_endpoint(
    bundle_id: str,
    body: ApprovalRequest,
    request: Request,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINATOR)),
):
    bundle = await ScriptBundle.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pacote não encontrado")

    if not can_approve_bundle(user, bundle):
        if bundle.submitted_by == str(user.id) and user.role == UserRole.COORDINATOR:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Coordenador não pode aprovar o próprio pacote.",
            )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Não pode aprovar este pacote")

    if bundle.status != BundleStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pacote não está pendente de aprovação",
        )

    if not body.approve:
        if not body.rejection_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Motivo de rejeição obrigatório",
            )
        checklist = ApprovalChecklist(
            rejection_reason=body.rejection_reason,
            rejected_by=str(user.id),
            rejected_at=datetime.utcnow(),
        )
        try:
            bundle = await approve_bundle(bundle_id, user, False, checklist)
        except (ValueError, PermissionError) as exc:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
        return _bundle_response(await get_bundle_response(str(bundle.id)))

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

    self_approved = bundle.submitted_by == str(user.id)
    checklist = ApprovalChecklist(
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

    try:
        await approve_bundle(bundle_id, user, True, checklist)
    except (ValueError, PermissionError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return _bundle_response(await get_bundle_response(bundle_id))


@router.post("/{bundle_id}/resubmit", response_model=BundleResponse)
async def resubmit_bundle_endpoint(
    bundle_id: str,
    body: BundleResubmit,
    request: Request,
    user: User = Depends(require_full_access),
):
    _check_submit_rate(str(user.id))

    bundle = await ScriptBundle.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pacote não encontrado")

    try:
        bundle = await resubmit_bundle(
            bundle_id,
            user,
            scripts=[s.tsql_content for s in body.scripts],
            title=body.title,
            demand_reference=body.demand_reference,
            pr_url=body.pr_url,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await log_audit(
        AuditEventType.BUNDLE_RESUBMITTED,
        actor=user,
        entity_type="script_bundle",
        entity_id=str(bundle.id),
        metadata={
            "title": bundle.title,
            "script_count": bundle.script_count,
            "server_count": bundle.server_count,
        },
        request=request,
    )

    return _bundle_response(await get_bundle_response(str(bundle.id)))
