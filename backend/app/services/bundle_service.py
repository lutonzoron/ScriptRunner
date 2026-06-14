import asyncio
from datetime import datetime

from app.models.audit_log import AuditEventType
from app.models.script_bundle import BundleStatus, ScriptBundle
from app.models.script_request import (
    ApprovalChecklist,
    ScriptRequest,
    ScriptStatus,
    ValidationIssue,
    ValidationSeverity,
)
from app.models.server import Server
from app.models.user import User, UserRole
from app.services.audit import log_audit
from app.services.script_service import execute_approved_script, process_validation
from app.services.script_utils import compute_content_hash, normalize_external_url


def _to_bundle_dict(bundle: ScriptBundle) -> dict:
    return {
        "id": str(bundle.id),
        "submitted_by": bundle.submitted_by,
        "submitted_by_name": bundle.submitted_by_name,
        "title": bundle.title,
        "demand_reference": bundle.demand_reference,
        "pr_url": bundle.pr_url,
        "server_ids": bundle.server_ids,
        "server_names": bundle.server_names,
        "database_name": bundle.database_name,
        "environment": bundle.environment,
        "status": bundle.status.value,
        "approval": bundle.approval.model_dump() if bundle.approval else None,
        "script_count": bundle.script_count,
        "server_count": bundle.server_count,
        "created_at": bundle.created_at,
        "validated_at": bundle.validated_at,
        "executed_at": bundle.executed_at,
    }


async def _get_bundle_children(bundle_id: str) -> list[ScriptRequest]:
    return (
        await ScriptRequest.find(ScriptRequest.bundle_id == bundle_id)
        .sort(+ScriptRequest.server_sequence, +ScriptRequest.script_sequence)
        .to_list()
    )


async def sync_bundle_status(bundle_id: str) -> None:
    bundle = await ScriptBundle.get(bundle_id)
    if not bundle or bundle.status not in (
        BundleStatus.VALIDATING,
        BundleStatus.PENDING_APPROVAL,
    ):
        return

    children = await _get_bundle_children(bundle_id)
    if not children:
        return

    if any(c.status == ScriptStatus.AUTO_REJECTED for c in children):
        bundle.status = BundleStatus.AUTO_REJECTED
        bundle.validated_at = datetime.utcnow()
        bundle.updated_at = datetime.utcnow()
        await bundle.save()

        for child in children:
            if child.status in (ScriptStatus.VALIDATING, ScriptStatus.PENDING_APPROVAL):
                child.status = ScriptStatus.AUTO_REJECTED
                child.validation_result = child.validation_result or [
                    ValidationIssue(
                        code="BUNDLE_PEER_FAILED",
                        severity=ValidationSeverity.ERROR,
                        message="Pacote reprovado por falha de validação em outro script/servidor.",
                    )
                ]
                child.validated_at = datetime.utcnow()
                child.updated_at = datetime.utcnow()
                await child.save()

        await log_audit(
            AuditEventType.BUNDLE_AUTO_VALIDATED,
            entity_type="script_bundle",
            entity_id=bundle_id,
            metadata={"status": bundle.status.value},
        )
        return

    if all(c.status == ScriptStatus.PENDING_APPROVAL for c in children):
        if bundle.status != BundleStatus.PENDING_APPROVAL:
            bundle.status = BundleStatus.PENDING_APPROVAL
            bundle.validated_at = datetime.utcnow()
            bundle.updated_at = datetime.utcnow()
            await bundle.save()
            await log_audit(
                AuditEventType.BUNDLE_AUTO_VALIDATED,
                entity_type="script_bundle",
                entity_id=bundle_id,
                metadata={"status": bundle.status.value},
            )


async def submit_bundle(
    user: User,
    title: str,
    demand_reference: str,
    pr_url: str,
    server_ids: list[str],
    database_name: str,
    scripts: list[str],
) -> ScriptBundle:
    if len(scripts) < 1:
        raise ValueError("Informe ao menos um script")
    if len(server_ids) < 1:
        raise ValueError("Informe ao menos um servidor")
    if len(scripts) == 1 and len(server_ids) == 1:
        raise ValueError("Use submissão avulsa para 1 script em 1 servidor")

    servers: list[Server] = []
    server_names: list[str] = []
    for server_id in server_ids:
        server = await Server.get(server_id)
        if not server or not server.active:
            raise ValueError(f"Servidor não encontrado ou inativo: {server_id}")
        servers.append(server)
        server_names.append(server.name)

    bundle = ScriptBundle(
        submitted_by=str(user.id),
        submitted_by_name=user.name,
        title=title,
        demand_reference=normalize_external_url(demand_reference),
        pr_url=normalize_external_url(pr_url),
        server_ids=server_ids,
        server_names=server_names,
        database_name=database_name,
        environment="dev",
        status=BundleStatus.VALIDATING,
        script_count=len(scripts),
        server_count=len(server_ids),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await bundle.insert()

    for server_seq, server in enumerate(servers):
        for script_seq, tsql in enumerate(scripts):
            content_hash = compute_content_hash(tsql)
            child = ScriptRequest(
                submitted_by=str(user.id),
                submitted_by_name=user.name,
                bundle_id=str(bundle.id),
                script_sequence=script_seq,
                server_sequence=server_seq,
                server_id=str(server.id),
                database_name=database_name,
                database_display_name=f"{database_name} — {server.name}",
                environment="dev",
                tsql_content=tsql,
                content_hash=content_hash,
                status=ScriptStatus.VALIDATING,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            await child.insert()
            asyncio.create_task(process_validation(str(child.id)))

    return bundle


def can_view_bundle(user: User, bundle: ScriptBundle) -> bool:
    if user.role in (UserRole.ADMIN, UserRole.COORDINATOR):
        return True
    return bundle.submitted_by == str(user.id)


def can_approve_bundle(user: User, bundle: ScriptBundle) -> bool:
    if user.role not in (UserRole.ADMIN, UserRole.COORDINATOR):
        return False
    if bundle.status != BundleStatus.PENDING_APPROVAL:
        return False
    if user.role == UserRole.COORDINATOR and bundle.submitted_by == str(user.id):
        return False
    return True


async def approve_bundle(
    bundle_id: str,
    user: User,
    approve: bool,
    checklist: ApprovalChecklist,
) -> ScriptBundle:
    bundle = await ScriptBundle.get(bundle_id)
    if not bundle:
        raise ValueError("Pacote não encontrado")

    if not can_approve_bundle(user, bundle):
        raise PermissionError("Não pode aprovar este pacote")

    children = await _get_bundle_children(bundle_id)

    if not approve:
        bundle.status = BundleStatus.MANUALLY_REJECTED
        bundle.approval = checklist
        bundle.updated_at = datetime.utcnow()
        await bundle.save()

        for child in children:
            child.status = ScriptStatus.MANUALLY_REJECTED
            child.approval = checklist
            child.updated_at = datetime.utcnow()
            await child.save()

        await log_audit(
            AuditEventType.BUNDLE_REJECTED,
            actor=user,
            entity_type="script_bundle",
            entity_id=bundle_id,
            metadata={"reason": checklist.rejection_reason},
        )
        return bundle

    bundle.status = BundleStatus.APPROVED
    bundle.approval = checklist
    bundle.updated_at = datetime.utcnow()
    await bundle.save()

    for child in children:
        child.status = ScriptStatus.APPROVED
        child.updated_at = datetime.utcnow()
        await child.save()

    await log_audit(
        AuditEventType.BUNDLE_APPROVED,
        actor=user,
        entity_type="script_bundle",
        entity_id=bundle_id,
        metadata={"self_approved": bundle.submitted_by == str(user.id)},
    )

    return await execute_approved_bundle(bundle_id, user)


async def execute_approved_bundle(bundle_id: str, actor: User) -> ScriptBundle:
    bundle = await ScriptBundle.get(bundle_id)
    if not bundle:
        raise ValueError("Pacote não encontrado")

    if bundle.status != BundleStatus.APPROVED:
        raise ValueError("Pacote não está no status aprovado")

    children = await _get_bundle_children(bundle_id)

    bundle.status = BundleStatus.EXECUTING
    bundle.updated_at = datetime.utcnow()
    await bundle.save()

    await log_audit(
        AuditEventType.BUNDLE_EXECUTION_STARTED,
        actor=actor,
        entity_type="script_bundle",
        entity_id=bundle_id,
    )

    failed = False
    for child in children:
        if failed:
            child.status = ScriptStatus.SKIPPED
            child.updated_at = datetime.utcnow()
            await child.save()
            continue

        if child.status != ScriptStatus.APPROVED:
            child.status = ScriptStatus.APPROVED
            child.updated_at = datetime.utcnow()
            await child.save()

        child = await execute_approved_script(str(child.id), actor)
        if child.status != ScriptStatus.EXECUTED:
            failed = True
            bundle.status = BundleStatus.EXECUTION_FAILED
            bundle.updated_at = datetime.utcnow()
            await bundle.save()
            await log_audit(
                AuditEventType.BUNDLE_EXECUTION_FAILED,
                actor=actor,
                entity_type="script_bundle",
                entity_id=bundle_id,
                metadata={
                    "failed_script_id": str(child.id),
                    "server_sequence": child.server_sequence,
                    "script_sequence": child.script_sequence,
                },
            )

    if not failed:
        bundle.status = BundleStatus.EXECUTED
        bundle.executed_at = datetime.utcnow()
        bundle.updated_at = datetime.utcnow()
        await bundle.save()
        await log_audit(
            AuditEventType.BUNDLE_EXECUTED,
            actor=actor,
            entity_type="script_bundle",
            entity_id=bundle_id,
        )

    return bundle


async def get_bundle_response(bundle_id: str) -> dict:
    bundle = await ScriptBundle.get(bundle_id)
    if not bundle:
        raise ValueError("Pacote não encontrado")

    from app.services.script_service import _to_script_dict

    children = await _get_bundle_children(bundle_id)
    data = _to_bundle_dict(bundle)
    data["scripts"] = [_to_script_dict(c) for c in children]
    return data


RESUBMITTABLE_BUNDLE_STATUSES = {
    BundleStatus.AUTO_REJECTED,
    BundleStatus.MANUALLY_REJECTED,
    BundleStatus.EXECUTION_FAILED,
}


def can_resubmit_bundle(user: User, bundle: ScriptBundle) -> bool:
    if bundle.status not in RESUBMITTABLE_BUNDLE_STATUSES:
        return False
    if user.role == UserRole.ADMIN:
        return True
    return bundle.submitted_by == str(user.id)


async def resubmit_bundle(
    bundle_id: str,
    user: User,
    scripts: list[str],
    title: str | None = None,
    demand_reference: str | None = None,
    pr_url: str | None = None,
) -> ScriptBundle:
    bundle = await ScriptBundle.get(bundle_id)
    if not bundle:
        raise ValueError("Pacote não encontrado")
    if not can_resubmit_bundle(user, bundle):
        raise PermissionError("Não é possível reenviar este pacote")
    if len(scripts) != bundle.script_count:
        raise ValueError(
            f"O pacote possui {bundle.script_count} script(s); envie exatamente essa quantidade."
        )

    if title is not None:
        bundle.title = title
    if demand_reference is not None:
        bundle.demand_reference = normalize_external_url(demand_reference)
    if pr_url is not None:
        bundle.pr_url = normalize_external_url(pr_url)

    bundle.status = BundleStatus.VALIDATING
    bundle.approval = None
    bundle.validated_at = None
    bundle.executed_at = None
    bundle.updated_at = datetime.utcnow()
    await bundle.save()

    children = await _get_bundle_children(bundle_id)
    for script_seq, tsql in enumerate(scripts):
        content_hash = compute_content_hash(tsql)
        for child in children:
            if child.script_sequence != script_seq:
                continue
            child.tsql_content = tsql
            child.content_hash = content_hash
            child.status = ScriptStatus.VALIDATING
            child.validation_result = []
            child.approval = None
            child.execution_result = None
            child.validated_at = None
            child.executed_at = None
            child.updated_at = datetime.utcnow()
            await child.save()
            asyncio.create_task(process_validation(str(child.id)))

    return bundle
