"""cardio support: exercise_type, met_value, duration_min

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-13
"""

import sqlalchemy as sa
from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column("exercise_type", sa.String(20), nullable=False, server_default="strength"),
    )
    op.add_column("exercises", sa.Column("met_value", sa.Float(), nullable=True))
    op.add_column("sets", sa.Column("duration_min", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("sets", "duration_min")
    op.drop_column("exercises", "met_value")
    op.drop_column("exercises", "exercise_type")
