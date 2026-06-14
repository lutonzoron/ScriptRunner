import hashlib
import re
from typing import Optional

GO_SPLIT_PATTERN = re.compile(r"^\s*GO\s*(?:\d+)?\s*$", re.IGNORECASE | re.MULTILINE)


def compute_content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def split_batches(script: str) -> list[str]:
    lines = script.splitlines(keepends=True)
    batches: list[str] = []
    current: list[str] = []

    for line in lines:
        if GO_SPLIT_PATTERN.match(line.strip()):
            batches.append("".join(current))
            current = []
        else:
            current.append(line)

    batches.append("".join(current))
    return batches


def strip_comments_for_empty_check(script: str) -> str:
    without_block = re.sub(r"/\*.*?\*/", "", script, flags=re.DOTALL)
    without_line = re.sub(r"--.*?$", "", without_line := without_block, flags=re.MULTILINE)
    return without_line.strip()
