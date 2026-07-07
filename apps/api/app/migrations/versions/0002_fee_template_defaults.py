"""fee template defaults and replay session binding

Revision ID: 0002_fee_template_defaults
Revises: 0001_create_core_tables
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_fee_template_defaults"
down_revision = "0001_create_core_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("fee_templates", sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("replay_sessions", sa.Column("fee_template_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_replay_sessions_fee_template_id",
        "replay_sessions",
        "fee_templates",
        ["fee_template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ux_fee_templates_default",
        "fee_templates",
        ["asset_type"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )

    op.execute(
        """
        UPDATE fee_templates
        SET name = '默认股票费率', is_default = true
        WHERE asset_type = 'stock'
          AND id = (SELECT id FROM fee_templates WHERE asset_type = 'stock' ORDER BY id LIMIT 1)
        """
    )
    op.execute(
        """
        UPDATE fee_templates
        SET name = '默认ETF费率', is_default = true
        WHERE asset_type = 'etf'
          AND id = (SELECT id FROM fee_templates WHERE asset_type = 'etf' ORDER BY id LIMIT 1)
        """
    )
    op.execute(
        sa.text(
            """
        INSERT INTO fee_templates (
            name, asset_type, commission_rate, min_commission,
            stamp_tax_rate, transfer_rate, config, is_default
        )
        SELECT
            '默认股票费率', 'stock', 0.02500000, 5.0000,
            0.05000000, 0.00000000,
            jsonb_build_object('commissionMode', 'rate', 'fixedCommission', 0),
            true
        WHERE NOT EXISTS (SELECT 1 FROM fee_templates WHERE asset_type = 'stock')
        """
        )
    )
    op.execute(
        sa.text(
            """
        INSERT INTO fee_templates (
            name, asset_type, commission_rate, min_commission,
            stamp_tax_rate, transfer_rate, config, is_default
        )
        SELECT
            '默认ETF费率', 'etf', 0.02500000, 5.0000,
            0.00000000, 0.00000000,
            jsonb_build_object('commissionMode', 'rate', 'fixedCommission', 0),
            true
        WHERE NOT EXISTS (SELECT 1 FROM fee_templates WHERE asset_type = 'etf')
        """
        )
    )


def downgrade() -> None:
    op.drop_index("ux_fee_templates_default", table_name="fee_templates")
    op.drop_constraint("fk_replay_sessions_fee_template_id", "replay_sessions", type_="foreignkey")
    op.drop_column("replay_sessions", "fee_template_id")
    op.drop_column("fee_templates", "is_default")
