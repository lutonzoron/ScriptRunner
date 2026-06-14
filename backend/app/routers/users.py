from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.dependencies import can_manage_role, require_roles
from app.auth.password import hash_password
from app.models.audit_log import AuditEventType
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserRole
from app.schemas import UserCreate, UserResponse, UserUpdate
from app.services.audit import log_audit

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(user: User = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINATOR))):
    users = await User.find_all().to_list()
    if user.role == UserRole.COORDINATOR:
        users = [u for u in users if u.role == UserRole.USER]
    return [UserResponse.from_document(u) for u in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    request: Request,
    actor: User = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINATOR)),
):
    if not can_manage_role(actor, body.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Não pode criar usuário com este papel")

    existing = await User.find_one(User.email == body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

    new_user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role=body.role,
        active=True,
        must_change_password=True,
        created_by=str(actor.id),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await new_user.insert()
    await log_audit(
        AuditEventType.USER_CREATED,
        actor=actor,
        entity_type="user",
        entity_id=str(new_user.id),
        metadata={"email": new_user.email, "role": new_user.role.value, "must_change_password": True},
        request=request,
    )
    return UserResponse.from_document(new_user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    body: UserUpdate,
    request: Request,
    actor: User = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINATOR)),
):
    target = await User.get(user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    if actor.role == UserRole.COORDINATOR and target.role != UserRole.USER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para editar este usuário")

    if body.role is not None and not can_manage_role(actor, body.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Não pode atribuir este papel")

    old_data = {"name": target.name, "role": target.role.value, "active": target.active}

    if body.name is not None:
        target.name = body.name
    if body.role is not None:
        target.role = body.role
    if body.active is not None:
        target.active = body.active
        if not body.active:
            target.token_version += 1
            await RefreshToken.find(RefreshToken.user_id == str(target.id)).update({"$set": {"revoked": True}})
            await log_audit(
                AuditEventType.USER_DEACTIVATED,
                actor=actor,
                entity_type="user",
                entity_id=str(target.id),
                request=request,
            )
    if body.password is not None:
        target.password_hash = hash_password(body.password)
        target.must_change_password = True
        target.token_version += 1
        await RefreshToken.find(RefreshToken.user_id == str(target.id)).update({"$set": {"revoked": True}})

    target.updated_at = datetime.utcnow()
    await target.save()

    await log_audit(
        AuditEventType.USER_UPDATED,
        actor=actor,
        entity_type="user",
        entity_id=str(target.id),
        metadata={"before": old_data, "after": {"name": target.name, "role": target.role.value, "active": target.active}},
        request=request,
    )
    return UserResponse.from_document(target)
