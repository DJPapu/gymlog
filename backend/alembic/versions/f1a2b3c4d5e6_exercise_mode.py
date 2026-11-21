"""add exercise_mode to routine_day_exercises

Revision ID: f1a2b3c4d5e6
Revises: b2c3d4e5f6a7
Create Date: 2026-11-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("routine_day_exercises") as batch_op:
        batch_op.add_column(
            sa.Column("exercise_mode", sa.String(20), nullable=False, server_default="normal")
        )


def downgrade() -> None:
    with op.batch_alter_table("routine_day_exercises") as batch_op:
        batch_op.drop_column("exercise_mode")
