from app.models.audit_log import AuditLog
from app.models.database_catalog import DatabaseCatalog
from app.models.refresh_token import RefreshToken
from app.models.script_bundle import ScriptBundle
from app.models.script_request import ScriptRequest
from app.models.server import Server
from app.models.user import User

DOCUMENT_MODELS = [User, Server, DatabaseCatalog, ScriptRequest, ScriptBundle, AuditLog, RefreshToken]

__all__ = [
    "User",
    "Server",
    "DatabaseCatalog",
    "ScriptRequest",
    "ScriptBundle",
    "AuditLog",
    "RefreshToken",
    "DOCUMENT_MODELS",
]
