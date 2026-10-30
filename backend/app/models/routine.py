from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, new_uuid


class Routine(Base, TimestampMixin):
    __tablename__ = "routines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_date: Mapped[str | None] = mapped_column(Date)
    duration_weeks: Mapped[int | None] = mapped_column(Integer)


class RoutineDay(Base, TimestampMixin):
    __tablename__ = "routine_days"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    routine_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("routines.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class RoutineDayExercise(Base, TimestampMixin):
    __tablename__ = "routine_day_exercises"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    routine_day_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("routine_days.id"), nullable=False, index=True
    )
    exercise_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exercises.id"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    target_sets: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    rep_min: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    rep_max: Mapped[int] = mapped_column(Integer, default=12, nullable=False)
    target_weight_kg: Mapped[float | None] = mapped_column()
    target_rpe: Mapped[float | None] = mapped_column()
    notes: Mapped[str | None] = mapped_column(Text)
