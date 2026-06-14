from app.models.server import DatabaseProvider
from app.services.execution.base import DatabaseExecutor
from app.services.execution.sql_server import SqlServerExecutor


class DatabaseExecutorFactory:
    @staticmethod
    def get(provider: DatabaseProvider) -> DatabaseExecutor:
        if provider == DatabaseProvider.SQLSERVER:
            return SqlServerExecutor()
        raise ValueError(f"Provider não suportado: {provider}")
