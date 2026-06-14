from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.dependencies import require_full_access, require_roles
from app.models.audit_log import AuditEventType
from app.models.server import Server
from app.models.user import User, UserRole
from app.schemas import (
    ConnectionTestRequest,
    ConnectionTestResponse,
    ServerCreate,
    ServerDatabaseResponse,
    ServerResponse,
    ServerUpdate,
)
from app.services.audit import log_audit
from app.services.connection import test_connection
from app.services.crypto import encrypt_value
from app.services.sql_server_catalog import list_server_databases

router = APIRouter(prefix="/servers", tags=["servers"])


def _to_response(server: Server) -> ServerResponse:
    return ServerResponse(
        id=str(server.id),
        name=server.name,
        host=server.host,
        provider=server.provider,
        active=server.active,
        created_at=server.created_at,
    )


@router.get("", response_model=list[ServerResponse])
async def list_servers(user: User = Depends(require_full_access)):
    if user.role == UserRole.ADMIN:
        servers = await Server.find_all().to_list()
    else:
        servers = await Server.find(Server.active == True).to_list()
    return [_to_response(s) for s in servers]


@router.get("/{server_id}/databases", response_model=list[ServerDatabaseResponse])
async def list_server_databases_endpoint(
    server_id: str,
    _: User = Depends(require_full_access),
):
    server = await Server.get(server_id)
    if not server or not server.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor não encontrado")

    try:
        names = await list_server_databases(server.encrypted_validation_connection_string)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Não foi possível listar as bases: {exc}",
        ) from exc

    return [ServerDatabaseResponse(name=name) for name in names]


@router.post("/actions/test-connection", response_model=ConnectionTestResponse)
async def test_server_connection(
    body: ConnectionTestRequest,
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    success, message, duration_ms = await test_connection(body.connection_string)
    return ConnectionTestResponse(success=success, message=message, duration_ms=duration_ms)


@router.post("", response_model=ServerResponse, status_code=status.HTTP_201_CREATED)
async def create_server(
    body: ServerCreate,
    request: Request,
    actor: User = Depends(require_roles(UserRole.ADMIN)),
):
    server = Server(
        name=body.name,
        host=body.host,
        encrypted_validation_connection_string=encrypt_value(body.validation_connection_string),
        encrypted_execution_connection_string=encrypt_value(body.execution_connection_string),
        provider=body.provider,
        active=True,
        created_by=str(actor.id),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await server.insert()
    await log_audit(
        AuditEventType.SERVER_CREATED,
        actor=actor,
        entity_type="server",
        entity_id=str(server.id),
        metadata={"name": server.name, "host": server.host},
        request=request,
    )
    return _to_response(server)


@router.patch("/{server_id}", response_model=ServerResponse)
async def update_server(
    server_id: str,
    body: ServerUpdate,
    request: Request,
    actor: User = Depends(require_roles(UserRole.ADMIN)),
):
    server = await Server.get(server_id)
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor não encontrado")

    if body.name is not None:
        server.name = body.name
    if body.host is not None:
        server.host = body.host
    if body.provider is not None:
        server.provider = body.provider
    if body.active is not None:
        server.active = body.active
    if body.validation_connection_string:
        server.encrypted_validation_connection_string = encrypt_value(body.validation_connection_string)
    if body.execution_connection_string:
        server.encrypted_execution_connection_string = encrypt_value(body.execution_connection_string)

    server.updated_at = datetime.utcnow()
    await server.save()
    await log_audit(
        AuditEventType.SERVER_UPDATED,
        actor=actor,
        entity_type="server",
        entity_id=str(server.id),
        metadata={"name": server.name},
        request=request,
    )
    return _to_response(server)
