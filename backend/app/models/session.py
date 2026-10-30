from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, new_uuid


class Session(Base, TimestampMixin):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    routine_day_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("routine_days.id"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)


class SessionExercise(Base, TimestampMixin):
    __tablename__ = "session_exercises"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id"), nullable=False, index=True
    )
    exercise_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exercises.id"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class Set(Base, TimestampMixin):
    __tablename__ = "sets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    session_exercise_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("session_exercises.id"), nullable=False, index=True
    )
    set_index: Mapped[int] = mapped_column(Integer, nullable=False)
    is_warmup: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    planned_reps: Mapped[int | None] = mapped_column(Integer)
    planned_weight_kg: Mapped[float | None] = mapped_column()
    reps: Mapped[int | None] = mapped_column(Integer)
    weight_kg: Mapped[float | None] = mapped_column()
    rpe: Mapped[float | None] = mapped_column(Numeric(3, 1))
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
