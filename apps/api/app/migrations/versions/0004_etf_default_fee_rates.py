"""update default ETF fee template rates

Revision ID: 0004_etf_default_fee_rates
Revises: 0003_kline_turnover_rate
Create Date: 2026-07-14
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_etf_default_fee_rates"
down_revision = "0003_kline_turnover_rate"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
        UPDATE fee_templates
        SET commission_rate = 0.03000000,
            min_commission = 0.1000,
            stamp_tax_rate = 0.00000000,
            transfer_rate = 0.00000000,
            config = jsonb_build_object('commissionMode', 'rate', 'fixedCommission', 0),
            updated_at = now()
        WHERE asset_type = 'etf'
          AND is_default = true
        """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
        UPDATE fee_templates
        SET commission_rate = 0.02500000,
            min_commission = 5.0000,
            stamp_tax_rate = 0.00000000,
            transfer_rate = 0.00000000,
            config = jsonb_build_object('commissionMode', 'rate', 'fixedCommission', 0),
            updated_at = now()
        WHERE asset_type = 'etf'
          AND is_default = true
        """
        )
    )
