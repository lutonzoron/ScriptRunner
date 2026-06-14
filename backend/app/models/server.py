from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import Field


class DatabaseProvider(str, Enum):
    SQLSERVER = "sqlserver"
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"


class Server(Document):
    name: str
    host: str
    encrypted_validation_connection_string: str
    encrypted_execution_connection_string: str
    provider: DatabaseProvider = DatabaseProvider.SQLSERVER
    active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "servers"
