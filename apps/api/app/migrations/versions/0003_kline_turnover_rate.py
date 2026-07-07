"""add turnover rate to kline daily

Revision ID: 0003_kline_turnover_rate
Revises: 0002_fee_template_defaults
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_kline_turnover_rate"
down_revision = "0002_fee_template_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kline_daily", sa.Column("turnover_rate", sa.Numeric(12, 8), nullable=True))


def downgrade() -> None:
    op.drop_column("kline_daily", "turnover_rate")
