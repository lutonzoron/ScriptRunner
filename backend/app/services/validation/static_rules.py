import re
from abc import ABC, abstractmethod
from typing import Optional

from app.models.script_request import ValidationIssue, ValidationSeverity
from app.services.script_utils import split_batches, strip_comments_for_empty_check


class ValidationRule(ABC):
    code: str

    @abstractmethod
    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        ...


class EmptyScriptRule(ValidationRule):
    code = "EMPTY_SCRIPT"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        if not strip_comments_for_empty_check(script):
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.ERROR,
                    message="Script vazio ou contém apenas comentários.",
                )
            ]
        return []


class ScriptTooLargeRule(ValidationRule):
    code = "SCRIPT_TOO_LARGE"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        max_size = context.get("max_script_size_bytes", 512_000)
        size = len(script.encode("utf-8"))
        if size > max_size:
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.ERROR,
                    message=f"Script excede o tamanho máximo de {max_size} bytes ({size} bytes).",
                )
            ]
        return []


class TooManyBatchesRule(ValidationRule):
    code = "TOO_MANY_BATCHES"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        max_batches = context.get("max_batches", 50)
        batches = split_batches(script)
        if len(batches) > max_batches:
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.ERROR,
                    message=f"Script possui {len(batches)} batches (máximo: {max_batches}).",
                )
            ]
        return []


class UpdateNoWhereRule(ValidationRule):
    code = "UPDATE_NO_WHERE"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        issues = []
        pattern = re.compile(r"\bUPDATE\b", re.IGNORECASE)
        for i, batch in enumerate(split_batches(script)):
            if not pattern.search(batch):
                continue
            if not re.search(r"\bWHERE\b", batch, re.IGNORECASE):
                issues.append(
                    ValidationIssue(
                        code=self.code,
                        severity=ValidationSeverity.ERROR,
                        message="UPDATE sem cláusula WHERE detectado.",
                        line=i + 1,
                    )
                )
        return issues


class DeleteNoWhereRule(ValidationRule):
    code = "DELETE_NO_WHERE"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        issues = []
        for i, batch in enumerate(split_batches(script)):
            if re.search(r"\bDELETE\b", batch, re.IGNORECASE) and not re.search(
                r"\bWHERE\b", batch, re.IGNORECASE
            ):
                issues.append(
                    ValidationIssue(
                        code=self.code,
                        severity=ValidationSeverity.ERROR,
                        message="DELETE sem cláusula WHERE detectado.",
                        line=i + 1,
                    )
                )
        return issues


class TruncateTableRule(ValidationRule):
    code = "TRUNCATE_TABLE"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        if re.search(r"\bTRUNCATE\s+TABLE\b", script, re.IGNORECASE):
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.ERROR,
                    message="TRUNCATE TABLE não é permitido.",
                )
            ]
        return []


class DropObjectRule(ValidationRule):
    code = "DROP_OBJECT"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        if re.search(r"\bDROP\s+(TABLE|DATABASE|SCHEMA)\b", script, re.IGNORECASE):
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.ERROR,
                    message="DROP TABLE/DATABASE/SCHEMA não é permitido.",
                )
            ]
        return []


class AlterDropColumnRule(ValidationRule):
    code = "ALTER_DROP_COLUMN"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        if re.search(r"\bALTER\s+TABLE\b.*\bDROP\s+COLUMN\b", script, re.IGNORECASE | re.DOTALL):
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.ERROR,
                    message="ALTER TABLE DROP COLUMN não é permitido.",
                )
            ]
        return []


class DangerousProcRule(ValidationRule):
    code = "DANGEROUS_PROC"

    PATTERNS = [
        r"\bxp_cmdshell\b",
        r"\bxp_regread\b",
        r"\bxp_regwrite\b",
        r"\bsp_configure\b",
        r"\bsp_OACreate\b",
        r"\bsp_OAMethod\b",
    ]

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        for pat in self.PATTERNS:
            if re.search(pat, script, re.IGNORECASE):
                return [
                    ValidationIssue(
                        code=self.code,
                        severity=ValidationSeverity.ERROR,
                        message=f"Procedimento perigoso detectado: {pat}",
                    )
                ]
        return []


class OpenrowsetBulkRule(ValidationRule):
    code = "OPENROWSET_BULK"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        if re.search(r"\b(OPENROWSET|BULK\s+INSERT)\b", script, re.IGNORECASE):
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.ERROR,
                    message="OPENROWSET ou BULK INSERT não é permitido.",
                )
            ]
        return []


class ShrinkDatabaseRule(ValidationRule):
    code = "SHRINK_DATABASE"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        if re.search(r"\bDBCC\s+SHRINK", script, re.IGNORECASE):
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.ERROR,
                    message="DBCC SHRINK não é permitido.",
                )
            ]
        return []


class TautologyWhereRule(ValidationRule):
    code = "TAUTOLOGY_WHERE"

    PATTERNS = [
        r"\bWHERE\s+1\s*=\s*1\b",
        r"\bWHERE\s+['\"]?.+['\"]?\s*=\s*['\"]?.+['\"]?\s+OR\s+1\s*=\s*1\b",
        r"\bOR\s+1\s*=\s*1\b",
        r"\bWHERE\s+['\"]?1['\"]?\s*=\s*['\"]?1['\"]?\b",
    ]

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        for pat in self.PATTERNS:
            if re.search(pat, script, re.IGNORECASE):
                return [
                    ValidationIssue(
                        code=self.code,
                        severity=ValidationSeverity.ERROR,
                        message="Condição tautológica em WHERE detectada (ex: WHERE 1=1).",
                    )
                ]
        return []


class DynamicSqlRule(ValidationRule):
    code = "DYNAMIC_SQL"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        if re.search(r"\b(EXEC\s*\(|EXECUTE\s*\(|sp_executesql)\b", script, re.IGNORECASE):
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.ERROR,
                    message="SQL dinâmico (EXEC/sp_executesql) não é permitido.",
                )
            ]
        return []


class BlockedKeywordRule(ValidationRule):
    code = "BLOCKED_KEYWORD"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        patterns = context.get("blocked_patterns", [])
        issues = []
        for pat in patterns:
            if re.search(pat, script, re.IGNORECASE):
                issues.append(
                    ValidationIssue(
                        code=self.code,
                        severity=ValidationSeverity.ERROR,
                        message=f"Padrão bloqueado detectado: {pat}",
                    )
                )
        return issues


class ProdEnvironmentWarning(ValidationRule):
    code = "PROD_ENVIRONMENT"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        if context.get("environment") == "prod":
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.WARNING,
                    message="Este script será executado em ambiente de PRODUÇÃO.",
                )
            ]
        return []


class NoTransactionWarning(ValidationRule):
    code = "NO_TRANSACTION"

    def check(self, script: str, context: dict) -> list[ValidationIssue]:
        dml_count = len(re.findall(r"\b(UPDATE|DELETE|INSERT|MERGE)\b", script, re.IGNORECASE))
        has_transaction = bool(re.search(r"\b(BEGIN\s+TRAN|COMMIT|ROLLBACK)\b", script, re.IGNORECASE))
        if dml_count > 1 and not has_transaction:
            return [
                ValidationIssue(
                    code=self.code,
                    severity=ValidationSeverity.WARNING,
                    message="Script com múltiplos DML sem transação explícita.",
                )
            ]
        return []


STATIC_RULES: list[ValidationRule] = [
    EmptyScriptRule(),
    ScriptTooLargeRule(),
    TooManyBatchesRule(),
    UpdateNoWhereRule(),
    DeleteNoWhereRule(),
    TruncateTableRule(),
    DropObjectRule(),
    AlterDropColumnRule(),
    DangerousProcRule(),
    OpenrowsetBulkRule(),
    ShrinkDatabaseRule(),
    TautologyWhereRule(),
    DynamicSqlRule(),
    BlockedKeywordRule(),
    ProdEnvironmentWarning(),
    NoTransactionWarning(),
]


def run_static_validation(script: str, context: dict) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for rule in STATIC_RULES:
        issues.extend(rule.check(script, context))
    return issues


def has_blocking_errors(issues: list[ValidationIssue]) -> bool:
    return any(i.severity == ValidationSeverity.ERROR for i in issues)
