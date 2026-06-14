from datetime import datetime
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.auth.jwt import decode_access_token
from app.models.user import User, UserRole

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
        token_version = payload.get("tv", 0)
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido") from exc

    user = await User.get(user_id)
    if not user or not user.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inativo ou não encontrado")
    if user.token_version != token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada")
    if user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Conta temporariamente bloqueada")
    return user


async def require_full_access(user: User = Depends(get_current_user)) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Troca de senha obrigatória no primeiro acesso",
        )
    return user


def require_roles(*roles: UserRole):
    async def checker(user: User = Depends(require_full_access)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissão negada")
        return user

    return checker


RequireAdmin = Depends(require_roles(UserRole.ADMIN))
RequireCoordinatorOrAdmin = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINATOR))


def can_manage_role(actor: User, target_role: UserRole) -> bool:
    if actor.role == UserRole.ADMIN:
        return True
    if actor.role == UserRole.COORDINATOR and target_role == UserRole.USER:
        return True
    return False


def can_access_database(user: User, allowed_roles: list[UserRole], allowed_user_ids: list[str]) -> bool:
    if str(user.id) in allowed_user_ids:
        return True
    return user.role in allowed_roles
