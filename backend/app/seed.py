from datetime import datetime, timedelta

from app.auth.password import hash_password
from app.config import get_settings
from app.models.user import User, UserRole


async def seed_admin() -> None:
    settings = get_settings()
    existing = await User.find_one(User.email == settings.admin_email)
    if existing:
        return

    admin = User(
        email=settings.admin_email,
        name=settings.admin_name,
        password_hash=hash_password(settings.admin_password),
        role=UserRole.ADMIN,
        active=True,
        created_by="system",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await admin.insert()
