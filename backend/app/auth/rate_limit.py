from datetime import datetime, timedelta
from typing import Callable

from fastapi import HTTPException, Request, status

_rate_store: dict[str, list[datetime]] = {}


def rate_limit(key: str, max_calls: int, window_seconds: int) -> Callable:
    async def dependency(request: Request) -> None:
        now = datetime.utcnow()
        window_start = now - timedelta(seconds=window_seconds)
        bucket_key = f"{key}:{request.client.host if request.client else 'unknown'}"
        timestamps = _rate_store.get(bucket_key, [])
        timestamps = [t for t in timestamps if t > window_start]
        if len(timestamps) >= max_calls:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Muitas requisições. Tente novamente mais tarde.",
            )
        timestamps.append(now)
        _rate_store[bucket_key] = timestamps

    return dependency


def user_rate_limit(key: str, max_calls: int, window_seconds: int) -> Callable:
    async def dependency(request: Request) -> str:
        user_id = getattr(request.state, "user_id", None)
        if not user_id:
            return ""
        now = datetime.utcnow()
        window_start = now - timedelta(seconds=window_seconds)
        bucket_key = f"{key}:{user_id}"
        timestamps = _rate_store.get(bucket_key, [])
        timestamps = [t for t in timestamps if t > window_start]
        if len(timestamps) >= max_calls:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Limite de submissões atingido. Tente novamente mais tarde.",
            )
        timestamps.append(now)
        _rate_store[bucket_key] = timestamps
        return user_id

    return dependency
