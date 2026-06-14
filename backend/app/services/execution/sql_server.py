import asyncio
import time

import pyodbc

from app.services.execution.base import DatabaseExecutor, ExecutionResultData
from app.services.odbc_utils import resolve_connection_string
from app.services.script_utils import split_batches


def _execute_sync(script: str, connection_string: str, timeout: int) -> ExecutionResultData:
    result = ExecutionResultData()
    batches = split_batches(script)
    conn = None
    start = time.perf_counter()

    try:
        conn = pyodbc.connect(resolve_connection_string(connection_string), timeout=timeout, autocommit=True)
        cursor = conn.cursor()
        total_rows = 0
        executed = 0

        for batch in batches:
            if not batch.strip():
                continue
            cursor.execute(batch)
            if cursor.rowcount and cursor.rowcount > 0:
                total_rows += cursor.rowcount
            executed += 1

        result.success = True
        result.batches_executed = executed
        result.rows_affected = total_rows if total_rows > 0 else None
    except pyodbc.Error as exc:
        result.success = False
        result.error = str(exc)
    finally:
        result.duration_ms = int((time.perf_counter() - start) * 1000)
        if conn:
            conn.close()

    return result


class SqlServerExecutor(DatabaseExecutor):
    async def execute(self, script: str, connection_string: str, timeout: int) -> ExecutionResultData:
        return await asyncio.to_thread(_execute_sync, script, connection_string, timeout)
