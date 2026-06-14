import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


def _get_fernet() -> Fernet:
    settings = get_settings()
    key_material = settings.encryption_key or settings.jwt_secret
    derived = base64.urlsafe_b64encode(hashlib.sha256(key_material.encode()).digest())
    return Fernet(derived)


def encrypt_value(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_value(encrypted: str) -> str:
    try:
        return _get_fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Falha ao descriptografar valor") from exc
