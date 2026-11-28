from datetime import date, datetime

from sqlalchemy import JSON, Date, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, new_uuid


class FoodLog(Base, TimestampMixin):
    __tablename__ = "food_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    logged_at: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    meal: Mapped[str] = mapped_column(String(20), nullable=False, default="snack")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    weight_g: Mapped[float | None] = mapped_column(Float(), nullable=True)
    calories_kcal: Mapped[float] = mapped_column(Float(), nullable=False)
    protein_g: Mapped[float | None] = mapped_column(Float(), nullable=True)
    carbs_g: Mapped[float | None] = mapped_column(Float(), nullable=True)
    fat_g: Mapped[float | None] = mapped_column(Float(), nullable=True)
    micronutrients: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class ActivityLog(Base, TimestampMixin):
    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    logged_at: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    duration_min: Mapped[float | None] = mapped_column(Float(), nullable=True)
    calories_burned: Mapped[int] = mapped_column(Integer(), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
