"""add activity_logs table

Revision ID: i4j5k6l7m8n9
Revises: h3c4d5e6f7a8
Create Date: 2026-11-27
"""

import sqlalchemy as sa
from alembic import op

revision = "i4j5k6l7m8n9"
down_revision = "h3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False, index=True),
        sa.Column("logged_at", sa.Date(), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("duration_min", sa.Float(), nullable=True),
        sa.Column("calories_burned", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("activity_logs")
