import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db
from app.models.routine import Routine, RoutineDay, RoutineDayExercise
from app.schemas.routine import (
    RoutineCreate,
    RoutineDayCreate,
    RoutineDayExerciseCreate,
    RoutineDayExerciseRead,
    RoutineDayRead,
    RoutineRead,
)

router = APIRouter(prefix="/routines", tags=["routines"])

DB = Annotated[Session, Depends(get_db)]


# ── Routines ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[RoutineRead])
def list_routines(db: DB, user_id: CurrentUser) -> list[Routine]:
    return list(
        db.execute(
            select(Routine).where(Routine.user_id == user_id, Routine.deleted_at.is_(None))
        ).scalars()
    )


@router.post("/", response_model=RoutineRead, status_code=status.HTTP_201_CREATED)
def create_routine(body: RoutineCreate, db: DB, user_id: CurrentUser) -> Routine:
    routine = Routine(id=body.id or str(uuid.uuid4()), user_id=user_id, **body.model_dump(exclude={"id"}))
    db.add(routine)
    db.commit()
    db.refresh(routine)
    return routine


@router.put("/{routine_id}", response_model=RoutineRead)
def update_routine(routine_id: str, body: RoutineCreate, db: DB, user_id: CurrentUser) -> Routine:
    r = _get_own_routine(routine_id, user_id, db)
    for k, v in body.model_dump(exclude={"id"}).items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


@router.delete("/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(routine_id: str, db: DB, user_id: CurrentUser) -> None:
    r = _get_own_routine(routine_id, user_id, db)
    r.deleted_at = datetime.now(timezone.utc)
    db.commit()


# ── Routine Days ───────────────────────────────────────────────────────────────

@router.get("/{routine_id}/days", response_model=list[RoutineDayRead])
def list_days(routine_id: str, db: DB, user_id: CurrentUser) -> list[RoutineDay]:
    _get_own_routine(routine_id, user_id, db)
    return list(
        db.execute(
            select(RoutineDay).where(
                RoutineDay.routine_id == routine_id, RoutineDay.deleted_at.is_(None)
            ).order_by(RoutineDay.position)
        ).scalars()
    )


@router.post("/{routine_id}/days", response_model=RoutineDayRead, status_code=status.HTTP_201_CREATED)
def create_day(routine_id: str, body: RoutineDayCreate, db: DB, user_id: CurrentUser) -> RoutineDay:
    _get_own_routine(routine_id, user_id, db)
    day = RoutineDay(id=body.id or str(uuid.uuid4()), routine_id=routine_id, **body.model_dump(exclude={"id"}))
    db.add(day)
    db.commit()
    db.refresh(day)
    return day


@router.put("/{routine_id}/days/{day_id}", response_model=RoutineDayRead)
def update_day(routine_id: str, day_id: str, body: RoutineDayCreate, db: DB, user_id: CurrentUser) -> RoutineDay:
    day = _get_own_day(routine_id, day_id, user_id, db)
    for k, v in body.model_dump(exclude={"id"}).items():
        setattr(day, k, v)
    db.commit()
    db.refresh(day)
    return day


@router.delete("/{routine_id}/days/{day_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_day(routine_id: str, day_id: str, db: DB, user_id: CurrentUser) -> None:
    day = _get_own_day(routine_id, day_id, user_id, db)
    day.deleted_at = datetime.now(timezone.utc)
    db.commit()


# ── Routine Day Exercises ──────────────────────────────────────────────────────

@router.get("/{routine_id}/days/{day_id}/exercises", response_model=list[RoutineDayExerciseRead])
def list_day_exercises(routine_id: str, day_id: str, db: DB, user_id: CurrentUser) -> list[RoutineDayExercise]:
    _get_own_day(routine_id, day_id, user_id, db)
    return list(
        db.execute(
            select(RoutineDayExercise).where(
                RoutineDayExercise.routine_day_id == day_id,
                RoutineDayExercise.deleted_at.is_(None),
            ).order_by(RoutineDayExercise.position)
        ).scalars()
    )


@router.post("/{routine_id}/days/{day_id}/exercises", response_model=RoutineDayExerciseRead, status_code=status.HTTP_201_CREATED)
def add_day_exercise(routine_id: str, day_id: str, body: RoutineDayExerciseCreate, db: DB, user_id: CurrentUser) -> RoutineDayExercise:
    _get_own_day(routine_id, day_id, user_id, db)
    rde = RoutineDayExercise(id=body.id or str(uuid.uuid4()), routine_day_id=day_id, **body.model_dump(exclude={"id"}))
    db.add(rde)
    db.commit()
    db.refresh(rde)
    return rde


@router.put("/{routine_id}/days/{day_id}/exercises/{rde_id}", response_model=RoutineDayExerciseRead)
def update_day_exercise(routine_id: str, day_id: str, rde_id: str, body: RoutineDayExerciseCreate, db: DB, user_id: CurrentUser) -> RoutineDayExercise:
    _get_own_day(routine_id, day_id, user_id, db)
    rde = db.get(RoutineDayExercise, rde_id)
    if not rde or rde.deleted_at or rde.routine_day_id != day_id:
        raise HTTPException(status_code=404, detail="Ejercicio de día no encontrado")
    for k, v in body.model_dump(exclude={"id"}).items():
        setattr(rde, k, v)
    db.commit()
    db.refresh(rde)
    return rde


@router.delete("/{routine_id}/days/{day_id}/exercises/{rde_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_day_exercise(routine_id: str, day_id: str, rde_id: str, db: DB, user_id: CurrentUser) -> None:
    _get_own_day(routine_id, day_id, user_id, db)
    rde = db.get(RoutineDayExercise, rde_id)
    if not rde or rde.deleted_at or rde.routine_day_id != day_id:
        raise HTTPException(status_code=404, detail="Ejercicio de día no encontrado")
    rde.deleted_at = datetime.now(timezone.utc)
    db.commit()


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_own_routine(routine_id: str, user_id: str, db: Session) -> Routine:
    r = db.get(Routine, routine_id)
    if not r or r.deleted_at:
        raise HTTPException(status_code=404, detail="Rutina no encontrada")
    if r.user_id != user_id:
        raise HTTPException(status_code=403, detail="Sin acceso")
    return r


def _get_own_day(routine_id: str, day_id: str, user_id: str, db: Session) -> RoutineDay:
    _get_own_routine(routine_id, user_id, db)
    day = db.get(RoutineDay, day_id)
    if not day or day.deleted_at or day.routine_id != routine_id:
        raise HTTPException(status_code=404, detail="Día de rutina no encontrado")
    return day
