from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db
from app.models import (
    BodyMetric,
    Exercise,
    Profile,
    Routine,
    RoutineDay,
    RoutineDayExercise,
    Session as SessionModel,
    SessionExercise,
    Set,
)
from app.schemas.sync import SyncPushRequest, SyncPushResponse, SyncPullResponse

router = APIRouter(prefix="/sync", tags=["sync"])

_TABLE_MAP = {
    "exercises": Exercise,
    "routines": Routine,
    "routine_days": RoutineDay,
    "routine_day_exercises": RoutineDayExercise,
    "sessions": SessionModel,
    "session_exercises": SessionExercise,
    "sets": Set,
    "profiles": Profile,
    "body_metrics": BodyMetric,
}

# Tablas cuyo user_id debe forzarse desde el JWT
_USER_ID_TABLES = {"routines", "sessions", "body_metrics", "profiles"}

# Orden topológico para satisfacer FKs: padres antes que hijos.
# Sin relationship() en los modelos SQLAlchemy no puede deducirlo solo.
_TABLE_ORDER = {
    "exercises": 0,
    "profiles": 0,
    "routines": 1,
    "routine_days": 2,
    "sessions": 2,
    "body_metrics": 2,
    "routine_day_exercises": 3,
    "session_exercises": 3,
    "sets": 4,
}


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _row_to_dict(row: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        elif isinstance(val, date):
            val = val.isoformat()
        result[col.name] = val
    return result


@router.post("/push", response_model=SyncPushResponse)
def sync_push(
    body: SyncPushRequest,
    user_id: CurrentUser,
    db: Session = Depends(get_db),
) -> SyncPushResponse:
    applied = 0
    errors: list[str] = []

    # Orden topológico: padres antes que hijos para no violar FKs durante el flush
    sorted_changes = sorted(
        body.changes,
        key=lambda c: _TABLE_ORDER.get(c.table, 99),
    )

    for change in sorted_changes:
        try:
            model_cls = _TABLE_MAP.get(change.table)
            if model_cls is None:
                errors.append(f"tabla desconocida: {change.table}")
                continue

            payload = dict(change.payload)

            # Forzar user_id desde JWT
            if change.table in _USER_ID_TABLES:
                payload["user_id"] = user_id

            # Convertir cadenas de fecha/hora a datetime
            for field in ("updated_at", "deleted_at", "started_at", "ended_at", "measured_at"):
                if field in payload:
                    payload[field] = _parse_dt(payload[field])
            # birth_date es date (no datetime)
            if "birth_date" in payload:
                payload["birth_date"] = _parse_date(payload["birth_date"])

            # Savepoint por cambio: un error no contamina el resto de la sesión
            with db.begin_nested():
                if change.op == "upsert":
                    existing = db.get(model_cls, change.record_id)
                    incoming_ts = payload.get("updated_at")

                    if existing is None:
                        obj = model_cls(**payload)
                        db.add(obj)
                    else:
                        # Last-write-wins por updated_at
                        existing_ts = existing.updated_at
                        if (
                            incoming_ts is None
                            or existing_ts is None
                            or incoming_ts > existing_ts
                        ):
                            for k, v in payload.items():
                                if hasattr(existing, k):
                                    setattr(existing, k, v)

                elif change.op == "delete":
                    existing = db.get(model_cls, change.record_id)
                    if existing:
                        existing.deleted_at = (
                            _parse_dt(payload.get("deleted_at")) or datetime.now(timezone.utc)
                        )

            applied += 1

        except Exception as exc:  # noqa: BLE001
            errors.append(f"{change.table}/{change.record_id}: {exc!s}")

    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        errors.append(f"commit error: {exc!s}")

    return SyncPushResponse(applied=applied, errors=errors)


@router.get("/pull", response_model=SyncPullResponse)
def sync_pull(
    since: str | None = Query(None),
    user_id: CurrentUser = ...,
    db: Session = Depends(get_db),
) -> SyncPullResponse:
    since_dt = _parse_dt(since) if since else None
    pulled_at = datetime.now(timezone.utc).isoformat()

    def fetch(model: Any, *scope_filters: Any) -> list[dict[str, Any]]:
        stmt = select(model)
        for f in scope_filters:
            stmt = stmt.where(f)
        if since_dt is not None:
            stmt = stmt.where(model.updated_at > since_dt)
        return [_row_to_dict(r) for r in db.execute(stmt).scalars()]

    # IDs de rutinas y sesiones del usuario (para filtrar tablas hijas)
    routine_ids = list(
        db.execute(select(Routine.id).where(Routine.user_id == user_id)).scalars()
    )
    session_ids = list(
        db.execute(select(SessionModel.id).where(SessionModel.user_id == user_id)).scalars()
    )
    day_ids = (
        list(db.execute(select(RoutineDay.id).where(RoutineDay.routine_id.in_(routine_ids))).scalars())
        if routine_ids else []
    )
    se_ids = (
        list(db.execute(select(SessionExercise.id).where(SessionExercise.session_id.in_(session_ids))).scalars())
        if session_ids else []
    )

    return SyncPullResponse(
        exercises=fetch(Exercise),  # catálogo compartido, sin filtro de usuario
        routines=fetch(Routine, Routine.user_id == user_id),
        routine_days=fetch(RoutineDay, RoutineDay.routine_id.in_(routine_ids)) if routine_ids else [],
        routine_day_exercises=fetch(RoutineDayExercise, RoutineDayExercise.routine_day_id.in_(day_ids)) if day_ids else [],
        sessions=fetch(SessionModel, SessionModel.user_id == user_id),
        session_exercises=fetch(SessionExercise, SessionExercise.session_id.in_(session_ids)) if session_ids else [],
        sets=fetch(Set, Set.session_exercise_id.in_(se_ids)) if se_ids else [],
        profiles=fetch(Profile, Profile.user_id == user_id),
        body_metrics=fetch(BodyMetric, BodyMetric.user_id == user_id),
        pulled_at=pulled_at,
    )
