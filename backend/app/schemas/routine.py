from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RoutineBase(BaseModel):
    name: str
    is_active: bool = True


class RoutineCreate(RoutineBase):
    id: str | None = None


class RoutineRead(RoutineBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    updated_at: datetime
    deleted_at: datetime | None


class RoutineDayBase(BaseModel):
    name: str
    position: int = 0


class RoutineDayCreate(RoutineDayBase):
    id: str | None = None


class RoutineDayRead(RoutineDayBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    routine_id: str
    updated_at: datetime
    deleted_at: datetime | None


class RoutineDayExerciseBase(BaseModel):
    exercise_id: str
    position: int = 0
    target_sets: int = 3
    rep_min: int = 8
    rep_max: int = 12
    target_weight_kg: float | None = None
    target_rpe: float | None = None
    notes: str | None = None


class RoutineDayExerciseCreate(RoutineDayExerciseBase):
    id: str | None = None


class RoutineDayExerciseRead(RoutineDayExerciseBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    routine_day_id: str
    updated_at: datetime
    deleted_at: datetime | None
