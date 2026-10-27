"""dashboard metadata

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-26 10:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('dashboards', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('dashboards', sa.Column('tags', sa.JSON(), nullable=False, server_default='[]'))
    op.add_column('dashboards', sa.Column('share_password', sa.String(255), nullable=True))
    op.add_column('dashboards', sa.Column('thumbnail', sa.Text(), nullable=True))
    op.add_column('dashboards', sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column('dashboards', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))


def downgrade() -> None:
    op.drop_column('dashboards', 'updated_at')
    op.drop_column('dashboards', 'created_at')
    op.drop_column('dashboards', 'thumbnail')
    op.drop_column('dashboards', 'share_password')
    op.drop_column('dashboards', 'tags')
    op.drop_column('dashboards', 'description')
