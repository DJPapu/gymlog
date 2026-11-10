"""add profile fields and body_metrics

Revision ID: c3e7a1f2d4b8
Revises: ba93977b16fe
Create Date: 2026-11-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3e7a1f2d4b8"
down_revision: Union[str, Sequence[str], None] = "ba93977b16fe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("height_cm", sa.Integer(), nullable=True))
    op.add_column("profiles", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("profiles", sa.Column("sex", sa.String(length=10), nullable=True))
    op.add_column("profiles", sa.Column("goal", sa.String(length=30), nullable=True))
    op.add_column(
        "profiles",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )
    op.add_column("profiles", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "body_metrics",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("body_fat_pct", sa.Float(), nullable=True),
        sa.Column("waist_cm", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_body_metrics_user_id", "body_metrics", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_body_metrics_user_id", table_name="body_metrics")
    op.drop_table("body_metrics")
    op.drop_column("profiles", "deleted_at")
    op.drop_column("profiles", "updated_at")
    op.drop_column("profiles", "goal")
    op.drop_column("profiles", "sex")
    op.drop_column("profiles", "birth_date")
    op.drop_column("profiles", "height_cm")
