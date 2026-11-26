"""add food_logs table

Revision ID: h3c4d5e6f7a8
Revises: f1a2b3c4d5e6
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op

revision = "h3c4d5e6f7a8"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "food_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False, index=True),
        sa.Column("logged_at", sa.Date(), nullable=False),
        sa.Column("meal", sa.String(20), nullable=False, server_default="snack"),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("weight_g", sa.Float(), nullable=True),
        sa.Column("calories_kcal", sa.Float(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=True),
        sa.Column("carbs_g", sa.Float(), nullable=True),
        sa.Column("fat_g", sa.Float(), nullable=True),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_food_logs_user_logged", "food_logs", ["user_id", "logged_at"])


def downgrade() -> None:
    op.drop_table("food_logs")
