import asyncio
import time

import pyodbc

from app.services.odbc_utils import resolve_connection_string


def _test_connection_sync(connection_string: str) -> tuple[bool, str, int]:
    conn = None
    start = time.perf_counter()
    try:
        conn = pyodbc.connect(resolve_connection_string(connection_string), timeout=15)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        duration_ms = int((time.perf_counter() - start) * 1000)
        return True, "Conexão estabelecida com sucesso", duration_ms
    except RuntimeError as exc:
        duration_ms = int((time.perf_counter() - start) * 1000)
        return False, str(exc), duration_ms
    except pyodbc.Error as exc:
        duration_ms = int((time.perf_counter() - start) * 1000)
        return False, str(exc), duration_ms
    finally:
        if conn:
            conn.close()


async def test_connection(connection_string: str) -> tuple[bool, str, int]:
    return await asyncio.to_thread(_test_connection_sync, connection_string)
