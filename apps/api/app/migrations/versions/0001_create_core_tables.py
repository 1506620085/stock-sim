"""create core tables

Revision ID: 0001_create_core_tables
Revises:
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_create_core_tables"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "instruments",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("exchange", sa.String(length=8), nullable=False),
        sa.Column("symbol", sa.String(length=24), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("asset_type", sa.String(length=16), nullable=False),
        sa.Column("list_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("symbol", name="uq_instruments_symbol"),
    )
    op.create_index("ix_instruments_asset_type", "instruments", ["asset_type"])
    op.create_index("ix_instruments_code", "instruments", ["code"])

    op.create_table(
        "kline_daily",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("instrument_id", sa.BigInteger(), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("open", sa.Numeric(18, 4), nullable=False),
        sa.Column("high", sa.Numeric(18, 4), nullable=False),
        sa.Column("low", sa.Numeric(18, 4), nullable=False),
        sa.Column("close", sa.Numeric(18, 4), nullable=False),
        sa.Column("volume", sa.Numeric(24, 4), nullable=False),
        sa.Column("amount", sa.Numeric(24, 4), nullable=True),
        sa.Column("adjust_type", sa.String(length=16), nullable=False, server_default="qfq"),
        sa.Column("source", sa.String(length=24), nullable=False, server_default="akshare"),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["instrument_id"], ["instruments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("instrument_id", "trade_date", "adjust_type", "source", name="uq_kline_daily_identity"),
    )
    op.create_index("ix_kline_daily_instrument_date", "kline_daily", ["instrument_id", "trade_date"])

    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("instrument_id", sa.BigInteger(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["instrument_id"], ["instruments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("instrument_id", name="uq_watchlist_items_instrument_id"),
    )

    op.create_table(
        "replay_sessions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("instrument_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("current_date", sa.Date(), nullable=False),
        sa.Column("hide_future", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("adjust_type", sa.String(length=16), nullable=False, server_default="qfq"),
        sa.Column("indicator_config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["instrument_id"], ["instruments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "trades",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.BigInteger(), nullable=False),
        sa.Column("instrument_id", sa.BigInteger(), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("side", sa.String(length=8), nullable=False),
        sa.Column("quantity", sa.Numeric(24, 4), nullable=False),
        sa.Column("price", sa.Numeric(18, 4), nullable=False),
        sa.Column("price_rule", sa.String(length=24), nullable=False),
        sa.Column("fee", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("emotion_score", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("side in ('buy', 'sell')", name="ck_trades_side"),
        sa.CheckConstraint("quantity > 0", name="ck_trades_quantity_positive"),
        sa.ForeignKeyConstraint(["instrument_id"], ["instruments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["replay_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trades_session_date", "trades", ["session_id", "trade_date"])

    op.create_table(
        "trade_reviews",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.BigInteger(), nullable=False),
        sa.Column("start_trade_id", sa.BigInteger(), nullable=True),
        sa.Column("end_trade_id", sa.BigInteger(), nullable=True),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("metrics_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["end_trade_id"], ["trades.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["replay_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["start_trade_id"], ["trades.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "fee_templates",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("asset_type", sa.String(length=16), nullable=False),
        sa.Column("commission_rate", sa.Numeric(12, 8), nullable=False),
        sa.Column("min_commission", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("stamp_tax_rate", sa.Numeric(12, 8), nullable=False, server_default="0"),
        sa.Column("transfer_rate", sa.Numeric(12, 8), nullable=False, server_default="0"),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("fee_templates")
    op.drop_table("trade_reviews")
    op.drop_index("ix_trades_session_date", table_name="trades")
    op.drop_table("trades")
    op.drop_table("replay_sessions")
    op.drop_table("watchlist_items")
    op.drop_index("ix_kline_daily_instrument_date", table_name="kline_daily")
    op.drop_table("kline_daily")
    op.drop_index("ix_instruments_code", table_name="instruments")
    op.drop_index("ix_instruments_asset_type", table_name="instruments")
    op.drop_table("instruments")
