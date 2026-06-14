import asyncio

import pyodbc

from app.services.crypto import decrypt_value
from app.services.odbc_utils import resolve_connection_string

_LIST_DATABASES_SQL = """
SELECT name
FROM sys.databases
WHERE state_desc = 'ONLINE' AND name <> 'tempdb'
ORDER BY name
"""


def _list_databases_sync(connection_string: str) -> list[str]:
    conn = None
    try:
        conn = pyodbc.connect(resolve_connection_string(connection_string), timeout=15)
        cursor = conn.cursor()
        cursor.execute(_LIST_DATABASES_SQL)
        return [row[0] for row in cursor.fetchall()]
    finally:
        if conn:
            conn.close()


async def list_server_databases(encrypted_validation_connection_string: str) -> list[str]:
    connection_string = decrypt_value(encrypted_validation_connection_string)
    return await asyncio.to_thread(_list_databases_sync, connection_string)
