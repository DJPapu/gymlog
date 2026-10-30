import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db
from app.models.exercise import Exercise
from app.schemas.exercise import ExerciseCreate, ExerciseRead

router = APIRouter(prefix="/exercises", tags=["exercises"])

DB = Annotated[Session, Depends(get_db)]


@router.get("/", response_model=list[ExerciseRead])
def list_exercises(db: DB, _: CurrentUser) -> list[Exercise]:
    return list(db.execute(select(Exercise).where(Exercise.deleted_at.is_(None))).scalars())


@router.get("/{exercise_id}", response_model=ExerciseRead)
def get_exercise(exercise_id: str, db: DB, _: CurrentUser) -> Exercise:
    ex = db.get(Exercise, exercise_id)
    if not ex or ex.deleted_at:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ejercicio no encontrado")
    return ex


@router.post("/", response_model=ExerciseRead, status_code=status.HTTP_201_CREATED)
def create_exercise(body: ExerciseCreate, db: DB, user_id: CurrentUser) -> Exercise:
    ex = Exercise(
        id=body.id or str(uuid.uuid4()),
        created_by=user_id,
        **body.model_dump(exclude={"id"}),
    )
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


@router.put("/{exercise_id}", response_model=ExerciseRead)
def update_exercise(exercise_id: str, body: ExerciseCreate, db: DB, _: CurrentUser) -> Exercise:
    ex = db.get(Exercise, exercise_id)
    if not ex or ex.deleted_at:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ejercicio no encontrado")
    for k, v in body.model_dump(exclude={"id"}).items():
        setattr(ex, k, v)
    db.commit()
    db.refresh(ex)
    return ex


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(exercise_id: str, db: DB, _: CurrentUser) -> None:
    ex = db.get(Exercise, exercise_id)
    if not ex or ex.deleted_at:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ejercicio no encontrado")
    from datetime import datetime, timezone
    ex.deleted_at = datetime.now(timezone.utc)
    db.commit()
