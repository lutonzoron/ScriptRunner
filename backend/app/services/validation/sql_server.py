import asyncio
from typing import Optional

import pyodbc

from app.models.script_request import ValidationIssue, ValidationSeverity
from app.services.odbc_utils import resolve_connection_string
from app.services.script_utils import split_batches


def _validate_batch_sync(connection_string: str, batch: str, use_noexec: bool) -> list[ValidationIssue]:
    if not batch.strip():
        return []

    issues: list[ValidationIssue] = []
    conn = None
    try:
        conn = pyodbc.connect(resolve_connection_string(connection_string), timeout=30, autocommit=True)
        cursor = conn.cursor()

        if use_noexec:
            cursor.execute("SET NOEXEC ON")
        else:
            cursor.execute("SET PARSEONLY ON")

        try:
            cursor.execute(batch)
        except pyodbc.Error as exc:
            issues.append(
                ValidationIssue(
                    code="SQL_SERVER_PARSE_ERROR",
                    severity=ValidationSeverity.ERROR,
                    message=str(exc),
                )
            )
        finally:
            if use_noexec:
                cursor.execute("SET NOEXEC OFF")
            else:
                cursor.execute("SET PARSEONLY OFF")

    except pyodbc.Error as exc:
        issues.append(
            ValidationIssue(
                code="SQL_SERVER_CONNECTION_ERROR",
                severity=ValidationSeverity.ERROR,
                message=f"Erro ao conectar para validação: {exc}",
            )
        )
    finally:
        if conn:
            conn.close()

    return issues


async def validate_on_sql_server(
    connection_string: str,
    script: str,
    use_noexec: bool = True,
) -> list[ValidationIssue]:
    batches = split_batches(script)
    all_issues: list[ValidationIssue] = []

    for i, batch in enumerate(batches):
        batch_issues = await asyncio.to_thread(
            _validate_batch_sync, connection_string, batch, use_noexec
        )
        for issue in batch_issues:
            issue.line = issue.line or (i + 1)
            all_issues.append(issue)
        if any(i.severity == ValidationSeverity.ERROR for i in batch_issues):
            break

    return all_issues
