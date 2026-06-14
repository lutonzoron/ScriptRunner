from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.dependencies import can_access_database, require_full_access, require_roles
from app.models.audit_log import AuditEventType
from app.models.database_catalog import DatabaseCatalog
from app.models.server import Server
from app.models.user import User, UserRole
from app.schemas import DatabaseCreate, DatabaseResponse, DatabaseUpdate
from app.services.audit import log_audit

router = APIRouter(prefix="/databases", tags=["databases"])


async def _to_response(db: DatabaseCatalog) -> DatabaseResponse:
    server = await Server.get(db.server_id)
    return DatabaseResponse(
        id=str(db.id),
        server_id=db.server_id,
        display_name=db.display_name,
        database_name=db.database_name,
        environment=db.environment,
        allowed_roles=db.allowed_roles,
        allowed_user_ids=db.allowed_user_ids,
        active=db.active,
        server_name=server.name if server else None,
        provider=server.provider if server else None,
    )


@router.get("", response_model=list[DatabaseResponse])
async def list_databases(user: User = Depends(require_full_access)):
    dbs = await DatabaseCatalog.find(DatabaseCatalog.active == True).to_list()
    if user.role == UserRole.ADMIN:
        return [await _to_response(d) for d in dbs]
    return [
        await _to_response(d)
        for d in dbs
        if can_access_database(user, d.allowed_roles, d.allowed_user_ids)
    ]


@router.get("/all", response_model=list[DatabaseResponse])
async def list_all_databases(_: User = Depends(require_roles(UserRole.ADMIN))):
    dbs = await DatabaseCatalog.find_all().to_list()
    return [await _to_response(d) for d in dbs]


@router.post("", response_model=DatabaseResponse, status_code=status.HTTP_201_CREATED)
async def create_database(
    body: DatabaseCreate,
    request: Request,
    actor: User = Depends(require_roles(UserRole.ADMIN)),
):
    server = await Server.get(body.server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor não encontrado")

    db = DatabaseCatalog(
        server_id=body.server_id,
        display_name=body.display_name,
        database_name=body.database_name,
        environment=body.environment,
        allowed_roles=body.allowed_roles,
        allowed_user_ids=body.allowed_user_ids,
        active=True,
        created_by=str(actor.id),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await db.insert()
    await log_audit(
        AuditEventType.DATABASE_CREATED,
        actor=actor,
        entity_type="database",
        entity_id=str(db.id),
        metadata={"display_name": db.display_name, "environment": db.environment.value},
        request=request,
    )
    return await _to_response(db)


@router.patch("/{database_id}", response_model=DatabaseResponse)
async def update_database(
    database_id: str,
    body: DatabaseUpdate,
    request: Request,
    actor: User = Depends(require_roles(UserRole.ADMIN)),
):
    db = await DatabaseCatalog.get(database_id)
    if not db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Base não encontrada")

    if body.display_name is not None:
        db.display_name = body.display_name
    if body.database_name is not None:
        db.database_name = body.database_name
    if body.environment is not None:
        db.environment = body.environment
    if body.allowed_roles is not None:
        db.allowed_roles = body.allowed_roles
    if body.allowed_user_ids is not None:
        db.allowed_user_ids = body.allowed_user_ids
    if body.active is not None:
        db.active = body.active

    db.updated_at = datetime.utcnow()
    await db.save()
    await log_audit(
        AuditEventType.DATABASE_UPDATED,
        actor=actor,
        entity_type="database",
        entity_id=str(db.id),
        metadata={"display_name": db.display_name},
        request=request,
    )
    return await _to_response(db)
