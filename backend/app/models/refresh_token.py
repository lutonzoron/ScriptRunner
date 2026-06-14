from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import Field


class RefreshToken(Document):
    token_hash: Indexed(str, unique=True)
    user_id: str
    expires_at: datetime
    revoked: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user_agent: Optional[str] = None
    ip: Optional[str] = None

    class Settings:
        name = "refresh_tokens"
