from datetime import date, datetime

from sqlalchemy import Date, Float, String, Text
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
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
