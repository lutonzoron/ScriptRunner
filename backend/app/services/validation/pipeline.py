from datetime import datetime

from app.config import get_settings
from app.models.script_request import ValidationIssue, ValidationSeverity
from app.models.server import Server
from app.services.crypto import decrypt_value
from app.services.validation.sql_server import validate_on_sql_server
from app.services.validation.static_rules import has_blocking_errors, run_static_validation


async def run_full_validation(
    script: str,
    database_name: str,
    environment: str,
    server: Server,
    blocked_patterns: list[str] | None = None,
) -> list[ValidationIssue]:
    settings = get_settings()
    context = {
        "max_script_size_bytes": settings.max_script_size_bytes,
        "max_batches": settings.max_batches,
        "environment": environment,
        "blocked_patterns": blocked_patterns or [],
    }

    issues = run_static_validation(script, context)
    if has_blocking_errors(issues):
        return issues

    try:
        conn_str = decrypt_value(server.encrypted_validation_connection_string)
        if database_name and "Database=" not in conn_str and "DATABASE=" not in conn_str:
            separator = ";" if not conn_str.endswith(";") else ""
            conn_str = f"{conn_str}{separator}Database={database_name}"
        sql_issues = await validate_on_sql_server(conn_str, script, use_noexec=True)
        issues.extend(sql_issues)
    except ValueError as exc:
        issues.append(
            ValidationIssue(
                code="VALIDATION_CONFIG_ERROR",
                severity=ValidationSeverity.ERROR,
                message=str(exc),
            )
        )
    except Exception as exc:
        issues.append(
            ValidationIssue(
                code="SQL_SERVER_VALIDATION_SKIPPED",
                severity=ValidationSeverity.WARNING,
                message=f"Validação no SQL Server indisponível: {exc}",
            )
        )

    return issues
