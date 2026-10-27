"""Create initial metadata tables."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table("database_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("db_type", sa.String(30), nullable=False),
        sa.Column("encrypted_uri", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="unknown"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_table("datasets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("source_ref", sa.Text(), nullable=False),
        sa.Column("columns", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(30), nullable=False, server_default="active"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_table("saved_queries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("sql", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table("charts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("dataset_id", sa.Integer(), sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_table("dashboards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_table("dashboard_charts",
        sa.Column("dashboard_id", sa.Integer(), sa.ForeignKey("dashboards.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("chart_id", sa.Integer(), sa.ForeignKey("charts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("position", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade():
    for table in ("dashboard_charts", "dashboards", "charts", "saved_queries", "datasets", "database_connections", "users"):
        op.drop_table(table)
