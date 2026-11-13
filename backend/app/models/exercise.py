from sqlalchemy import JSON, Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, new_uuid


class Exercise(Base, TimestampMixin):
    __tablename__ = "exercises"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    machine_name: Mapped[str | None] = mapped_column(String(200))
    equipment: Mapped[str] = mapped_column(String(20), nullable=False)
    primary_muscle: Mapped[str] = mapped_column(String(50), nullable=False)
    secondary_muscles: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    movement_pattern: Mapped[str] = mapped_column(String(20), nullable=False)
    unilateral: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    weight_increment_kg: Mapped[float] = mapped_column(default=2.5, nullable=False)
    default_rep_range: Mapped[str] = mapped_column(String(10), default="8-12", nullable=False)
    setup_tips: Mapped[str | None] = mapped_column(Text)
    photo_ref: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(36))
