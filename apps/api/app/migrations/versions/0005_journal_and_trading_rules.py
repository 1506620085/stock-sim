"""add journal entries and trading rules

Revision ID: 0005_journal_and_trading_rules
Revises: 0004_etf_default_fee_rates
Create Date: 2026-07-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_journal_and_trading_rules"
down_revision = "0004_etf_default_fee_rates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trading_rules",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trading_rules_status_category", "trading_rules", ["status", "category"])

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("side", sa.String(length=16), nullable=False),
        sa.Column("symbol_code", sa.String(length=16), nullable=True),
        sa.Column("symbol_name", sa.String(length=64), nullable=True),
        sa.Column("price", sa.Numeric(18, 4), nullable=True),
        sa.Column("quantity", sa.Numeric(24, 4), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("plan_note", sa.Text(), nullable=True),
        sa.Column("emotion_score", sa.Integer(), nullable=True),
        sa.Column("emotion_note", sa.String(length=255), nullable=True),
        sa.Column("result_note", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("rule_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_journal_entries_entry_date", "journal_entries", ["entry_date"])


def downgrade() -> None:
    op.drop_index("ix_journal_entries_entry_date", table_name="journal_entries")
    op.drop_table("journal_entries")
    op.drop_index("ix_trading_rules_status_category", table_name="trading_rules")
    op.drop_table("trading_rules")
