import re

import pyodbc

PREFERRED_DRIVERS = [
    "ODBC Driver 18 for SQL Server",
    "ODBC Driver 17 for SQL Server",
    "ODBC Driver 13 for SQL Server",
    "ODBC Driver 11 for SQL Server",
    "SQL Server",
]

_DRIVER_PATTERN = re.compile(r"(?i)Driver\s*=\s*\{[^}]*\}")
_ENCRYPT_PATTERN = re.compile(r"(?i);?\s*Encrypt\s*=\s*[^;]*")
_TRUST_SERVER_CERT_PATTERN = re.compile(r"(?i);?\s*TrustServerCertificate\s*=\s*[^;]*")


def get_sql_server_driver() -> str:
    available = {driver.casefold(): driver for driver in pyodbc.drivers()}
    for preferred in PREFERRED_DRIVERS:
        match = available.get(preferred.casefold())
        if match:
            return match
    installed = ", ".join(pyodbc.drivers()) or "nenhum"
    raise RuntimeError(
        "Nenhum driver ODBC para SQL Server encontrado. "
        f"Drivers instalados: {installed}"
    )


def _normalize_for_driver(connection_string: str, driver: str) -> str:
    normalized = connection_string.strip().strip(";")
    if driver.casefold() == "sql server":
        normalized = _ENCRYPT_PATTERN.sub("", normalized)
        normalized = _TRUST_SERVER_CERT_PATTERN.sub("", normalized)
    return normalized.strip(";")


def resolve_connection_string(connection_string: str) -> str:
    driver = get_sql_server_driver()
    if _DRIVER_PATTERN.search(connection_string):
        resolved = _DRIVER_PATTERN.sub(f"Driver={{{driver}}}", connection_string, count=1)
    else:
        resolved = connection_string.strip().strip(";")
        resolved = f"Driver={{{driver}}};{resolved}"
    return _normalize_for_driver(resolved, driver)
