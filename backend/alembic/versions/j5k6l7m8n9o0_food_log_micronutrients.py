"""add micronutrients to food_logs

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-11-28
"""

import sqlalchemy as sa
from alembic import op

revision = "j5k6l7m8n9o0"
down_revision = "i4j5k6l7m8n9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("food_logs", sa.Column("micronutrients", sa.JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("food_logs", "micronutrients")
