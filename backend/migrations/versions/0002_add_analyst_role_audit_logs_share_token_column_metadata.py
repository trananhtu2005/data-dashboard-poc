"""Add analyst role, audit logs, share token and column metadata."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(100), nullable=False, index=True),
        sa.Column("resource", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), index=True),
    )
    op.add_column("dashboards", sa.Column("share_token", sa.String(64), unique=True, index=True, nullable=True))
    op.add_column("datasets", sa.Column("column_metadata", sa.JSON(), nullable=False, server_default="{}"))


def downgrade():
    op.drop_column("datasets", "column_metadata")
    op.drop_column("dashboards", "share_token")
    op.drop_table("audit_logs")
