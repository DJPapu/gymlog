"""photo_ref to Text for data URL support

Revision ID: a1b2c3d4e5f6
Revises: c3e7a1f2d4b8
Create Date: 2026-11-11

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'c3e7a1f2d4b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('exercises', 'photo_ref', type_=sa.Text(), existing_type=sa.String(300), existing_nullable=True)


def downgrade() -> None:
    op.alter_column('exercises', 'photo_ref', type_=sa.String(300), existing_type=sa.Text(), existing_nullable=True)
