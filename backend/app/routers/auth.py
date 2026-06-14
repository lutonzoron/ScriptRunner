import asyncio
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token, create_refresh_token_value, hash_token
from app.auth.password import hash_password, verify_password
from app.auth.rate_limit import rate_limit
from app.config import get_settings
from app.models.audit_log import AuditEventType
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas import ChangePasswordRequest, LoginRequest, TokenResponse, UserResponse
from app.services.audit import log_audit

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    _: None = Depends(rate_limit("login", 5, 60)),
):
    settings = get_settings()
    user = await User.find_one(User.email == body.email)

    if not user or not user.active:
        await log_audit(
            AuditEventType.AUTH_LOGIN_FAILED,
            actor_email=body.email,
            metadata={"reason": "user_not_found"},
            request=request,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    if user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Conta temporariamente bloqueada")

    if not verify_password(body.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.login_max_attempts:
            user.locked_until = datetime.utcnow() + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_attempts = 0
        user.updated_at = datetime.utcnow()
        await user.save()
        await log_audit(
            AuditEventType.AUTH_LOGIN_FAILED,
            actor=user,
            metadata={"reason": "invalid_password"},
            request=request,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    user.failed_login_attempts = 0
    user.locked_until = None
    user.updated_at = datetime.utcnow()
    await user.save()

    access_token = create_access_token({"sub": str(user.id), "role": user.role.value, "tv": user.token_version})
    refresh_value = create_refresh_token_value()
    refresh_doc = RefreshToken(
        token_hash=hash_token(refresh_value),
        user_id=str(user.id),
        expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
        user_agent=request.headers.get("user-agent"),
        ip=request.client.host if request.client else None,
    )
    await refresh_doc.insert()

    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_value,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/auth",
    )

    await log_audit(AuditEventType.AUTH_LOGIN, actor=user, request=request)
    return TokenResponse(access_token=access_token, user=UserResponse.from_document(user))


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, response: Response):
    settings = get_settings()
    refresh_value = request.cookies.get(REFRESH_COOKIE)
    if not refresh_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token ausente")

    token_doc = await RefreshToken.find_one(
        RefreshToken.token_hash == hash_token(refresh_value),
        RefreshToken.revoked == False,
    )
    if not token_doc or token_doc.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    user = await User.get(token_doc.user_id)
    if not user or not user.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inválido")

    token_doc.revoked = True
    await token_doc.save()

    new_refresh = create_refresh_token_value()
    await RefreshToken(
        token_hash=hash_token(new_refresh),
        user_id=str(user.id),
        expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
        user_agent=request.headers.get("user-agent"),
        ip=request.client.host if request.client else None,
    ).insert()

    response.set_cookie(
        key=REFRESH_COOKIE,
        value=new_refresh,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/auth",
    )

    access_token = create_access_token({"sub": str(user.id), "role": user.role.value, "tv": user.token_version})
    return TokenResponse(access_token=access_token, user=UserResponse.from_document(user))


@router.post("/logout")
async def logout(request: Request, response: Response, user: User = Depends(get_current_user)):
    refresh_value = request.cookies.get(REFRESH_COOKIE)
    if refresh_value:
        token_doc = await RefreshToken.find_one(RefreshToken.token_hash == hash_token(refresh_value))
        if token_doc:
            token_doc.revoked = True
            await token_doc.save()

    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    await log_audit(AuditEventType.AUTH_LOGOUT, actor=user, request=request)
    return {"message": "Logout realizado"}


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return UserResponse.from_document(user)


@router.post("/change-password", response_model=UserResponse)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta")

    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A nova senha deve ser diferente da senha atual",
        )

    was_first_access = user.must_change_password
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    user.failed_login_attempts = 0
    user.locked_until = None
    user.updated_at = datetime.utcnow()
    await user.save()

    await log_audit(
        AuditEventType.PASSWORD_CHANGED,
        actor=user,
        entity_type="user",
        entity_id=str(user.id),
        metadata={"first_access": was_first_access},
        request=request,
    )
    return UserResponse.from_document(user)
