from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ExecutionResultData:
    success: bool = False
    duration_ms: int | None = None
    rows_affected: int | None = None
    messages: list[str] = field(default_factory=list)
    error: str | None = None
    batches_executed: int = 0


class DatabaseExecutor(ABC):
    @abstractmethod
    async def execute(self, script: str, connection_string: str, timeout: int) -> ExecutionResultData:
        ...
