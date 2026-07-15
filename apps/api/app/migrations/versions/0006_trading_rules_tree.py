"""add tree fields to trading rules

Revision ID: 0006_trading_rules_tree
Revises: 0005_journal_and_trading_rules
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_trading_rules_tree"
down_revision = "0005_journal_and_trading_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trading_rules", sa.Column("parent_id", sa.BigInteger(), nullable=True))
    op.add_column(
        "trading_rules",
        sa.Column("node_type", sa.String(length=16), nullable=False, server_default="doc"),
    )
    op.add_column(
        "trading_rules",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_foreign_key(
        "fk_trading_rules_parent_id",
        "trading_rules",
        "trading_rules",
        ["parent_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_trading_rules_parent_sort", "trading_rules", ["parent_id", "sort_order"])

    # Seed default folders and attach legacy docs under 操作规则
    conn = op.get_bind()
    now = sa.text("now()")
    result = conn.execute(
        sa.text(
            """
            INSERT INTO trading_rules (title, body, category, status, tags, parent_id, node_type, sort_order, created_at, updated_at)
            VALUES
              ('操作规则', '', 'other', 'active', '[]'::jsonb, NULL, 'folder', 0, now(), now()),
              ('总结笔记', '', 'other', 'active', '[]'::jsonb, NULL, 'folder', 1, now(), now())
            RETURNING id, title
            """
        )
    )
    folders = {row.title: row.id for row in result}
    rules_folder_id = folders.get("操作规则")
    if rules_folder_id is not None:
        conn.execute(
            sa.text(
                """
                UPDATE trading_rules
                SET parent_id = :parent_id,
                    sort_order = id,
                    node_type = 'doc',
                    updated_at = now()
                WHERE node_type = 'doc' AND parent_id IS NULL AND id <> :parent_id
                """
            ),
            {"parent_id": rules_folder_id},
        )


def downgrade() -> None:
    op.drop_index("ix_trading_rules_parent_sort", table_name="trading_rules")
    op.drop_constraint("fk_trading_rules_parent_id", "trading_rules", type_="foreignkey")
    op.drop_column("trading_rules", "sort_order")
    op.drop_column("trading_rules", "node_type")
    op.drop_column("trading_rules", "parent_id")
