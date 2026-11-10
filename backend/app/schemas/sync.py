from typing import Any, Literal

from pydantic import BaseModel


class SyncChange(BaseModel):
    table: str
    op: Literal["upsert", "delete"]
    record_id: str
    payload: dict[str, Any]


class SyncPushRequest(BaseModel):
    changes: list[SyncChange]


class SyncPushResponse(BaseModel):
    applied: int
    errors: list[str] = []


class SyncPullResponse(BaseModel):
    exercises: list[dict[str, Any]] = []
    routines: list[dict[str, Any]] = []
    routine_days: list[dict[str, Any]] = []
    routine_day_exercises: list[dict[str, Any]] = []
    sessions: list[dict[str, Any]] = []
    session_exercises: list[dict[str, Any]] = []
    sets: list[dict[str, Any]] = []
    profiles: list[dict[str, Any]] = []
    body_metrics: list[dict[str, Any]] = []
    pulled_at: str
