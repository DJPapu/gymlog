from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ExerciseBase(BaseModel):
    name: str
    machine_name: str | None = None
    equipment: str
    primary_muscle: str
    secondary_muscles: list[str] = []
    movement_pattern: str
    unilateral: bool = False
    weight_increment_kg: float = 2.5
    default_rep_range: str = "8-12"
    setup_tips: str | None = None
    photo_ref: str | None = None


class ExerciseCreate(ExerciseBase):
    id: str | None = None


class ExerciseRead(ExerciseBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_by: str | None
    updated_at: datetime
    deleted_at: datetime | None
