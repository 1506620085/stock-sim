"""add table and column comments

Revision ID: 0007_database_comments
Revises: 0006_trading_rules_tree
Create Date: 2026-08-26
"""
from alembic import op

revision = "0007_database_comments"
down_revision = "0006_trading_rules_tree"
branch_labels = None
depends_on = None

# (表名, 表注释, {列名: 列注释})
TABLE_COMMENTS: list[tuple[str, str, dict[str, str]]] = [
    (
        "instruments",
        "标的（股票/ETF）基础信息",
        {
            "id": "主键",
            "code": "证券代码（不含交易所后缀）",
            "exchange": "交易所代码（如 SH、SZ）",
            "symbol": "完整标的代码（交易所+代码，全局唯一）",
            "name": "标的名称",
            "asset_type": "资产类型（stock/etf 等）",
            "list_date": "上市日期",
            "is_active": "是否有效、可交易",
            "created_at": "创建时间（UTC）",
            "updated_at": "更新时间（UTC）",
        },
    ),
    (
        "kline_daily",
        "日 K 线行情数据",
        {
            "id": "主键",
            "instrument_id": "关联标的 ID",
            "trade_date": "交易日",
            "open": "开盘价",
            "high": "最高价",
            "low": "最低价",
            "close": "收盘价",
            "volume": "成交量",
            "amount": "成交额",
            "turnover_rate": "换手率",
            "adjust_type": "复权类型（qfq 前复权 / hfq 后复权 / none 不复权）",
            "source": "数据来源（如 akshare）",
            "source_updated_at": "数据源最后更新时间",
            "created_at": "创建时间（UTC）",
            "updated_at": "更新时间（UTC）",
        },
    ),
    (
        "watchlist_items",
        "自选股列表",
        {
            "id": "主键",
            "instrument_id": "关联标的 ID",
            "sort_order": "排序序号（越小越靠前）",
            "created_at": "加入自选时间（UTC）",
        },
    ),
    (
        "replay_sessions",
        "K 线复盘训练会话",
        {
            "id": "主键",
            "instrument_id": "关联标的 ID",
            "name": "会话名称",
            "start_date": "复盘起始日期",
            "current_date": "当前回放到的日期",
            "hide_future": "是否隐藏未来 K 线",
            "adjust_type": "复权类型",
            "indicator_config": "主图/副图指标配置（JSON）",
            "fee_template_id": "关联费率模板 ID",
            "created_at": "创建时间（UTC）",
            "updated_at": "更新时间（UTC）",
        },
    ),
    (
        "trades",
        "复盘会话内的模拟成交记录",
        {
            "id": "主键",
            "session_id": "关联复盘会话 ID",
            "instrument_id": "关联标的 ID",
            "trade_date": "成交日期",
            "side": "买卖方向（buy 买入 / sell 卖出）",
            "quantity": "成交数量",
            "price": "成交价格",
            "price_rule": "成交价规则（如 close 收盘价）",
            "fee": "手续费",
            "note": "交易备注",
            "emotion_score": "情绪评分（1–5）",
            "created_at": "创建时间（UTC）",
        },
    ),
    (
        "trade_reviews",
        "复盘区间总结与标签",
        {
            "id": "主键",
            "session_id": "关联复盘会话 ID",
            "start_trade_id": "复盘区间起始交易 ID",
            "end_trade_id": "复盘区间结束交易 ID",
            "title": "复盘标题",
            "note": "复盘正文",
            "tags": "标签列表（JSON 数组）",
            "metrics_snapshot": "指标快照（JSON，如盈亏、胜率等）",
            "created_at": "创建时间（UTC）",
            "updated_at": "更新时间（UTC）",
        },
    ),
    (
        "fee_templates",
        "交易费率模板",
        {
            "id": "主键",
            "name": "模板名称",
            "asset_type": "适用资产类型（stock/etf 等）",
            "commission_rate": "佣金费率（%）",
            "min_commission": "最低佣金（元）",
            "stamp_tax_rate": "印花税率（%，卖出时计）",
            "transfer_rate": "过户费率（%）",
            "config": "扩展配置（JSON，如固定佣金模式）",
            "is_default": "是否为该资产类型的默认模板",
            "created_at": "创建时间（UTC）",
            "updated_at": "更新时间（UTC）",
        },
    ),
    (
        "journal_entries",
        "实盘交易笔记",
        {
            "id": "主键",
            "entry_date": "笔记日期",
            "side": "交易方向（buy/sell/watch/other）",
            "symbol_code": "标的代码",
            "symbol_name": "标的名称",
            "price": "成交或关注价格",
            "quantity": "成交数量",
            "reason": "操作理由",
            "plan_note": "交易计划说明",
            "emotion_score": "情绪评分（1–5）",
            "emotion_note": "情绪说明",
            "result_note": "结果复盘",
            "tags": "标签列表（JSON 数组）",
            "rule_ids": "关联操作规则 ID 列表（JSON 数组）",
            "created_at": "创建时间（UTC）",
            "updated_at": "更新时间（UTC）",
        },
    ),
    (
        "trading_rules",
        "操作规则与总结笔记（树形知识库）",
        {
            "id": "主键",
            "title": "标题",
            "body": "正文内容（TipTap 富文本 JSON）",
            "category": "分类（position/buy/sell/t_trade/emotion/other）",
            "status": "状态（active 启用 / archived 归档）",
            "tags": "标签列表（JSON 数组）",
            "parent_id": "父节点 ID（树形目录，NULL 表示根级）",
            "node_type": "节点类型（folder 文件夹 / doc 文档）",
            "sort_order": "同级排序序号",
            "created_at": "创建时间（UTC）",
            "updated_at": "更新时间（UTC）",
        },
    ),
]


def _quote_ident(name: str) -> str:
    return f'"{name}"' if name in {"current_date"} else name


def _escape_sql(value: str) -> str:
    return value.replace("'", "''")


def _apply_comments() -> None:
    for table, table_comment, columns in TABLE_COMMENTS:
        op.execute(f"COMMENT ON TABLE {table} IS '{_escape_sql(table_comment)}'")
        for column, column_comment in columns.items():
            op.execute(f"COMMENT ON COLUMN {table}.{_quote_ident(column)} IS '{_escape_sql(column_comment)}'")


def _clear_comments() -> None:
    for table, _, columns in TABLE_COMMENTS:
        op.execute(f"COMMENT ON TABLE {table} IS NULL")
        for column in columns:
            op.execute(f"COMMENT ON COLUMN {table}.{_quote_ident(column)} IS NULL")


def upgrade() -> None:
    _apply_comments()


def downgrade() -> None:
    _clear_comments()
