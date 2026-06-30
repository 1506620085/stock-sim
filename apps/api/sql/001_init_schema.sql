BEGIN;

SET TIME ZONE 'UTC';

CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

CREATE TABLE IF NOT EXISTS instruments (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(16) NOT NULL,
    exchange VARCHAR(8) NOT NULL,
    symbol VARCHAR(24) NOT NULL,
    name VARCHAR(64) NOT NULL,
    asset_type VARCHAR(16) NOT NULL,
    list_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_instruments_symbol UNIQUE (symbol)
);

CREATE INDEX IF NOT EXISTS ix_instruments_asset_type ON instruments (asset_type);
CREATE INDEX IF NOT EXISTS ix_instruments_code ON instruments (code);

CREATE TABLE IF NOT EXISTS kline_daily (
    id BIGSERIAL PRIMARY KEY,
    instrument_id BIGINT NOT NULL REFERENCES instruments (id) ON DELETE CASCADE,
    trade_date DATE NOT NULL,
    open NUMERIC(18, 4) NOT NULL,
    high NUMERIC(18, 4) NOT NULL,
    low NUMERIC(18, 4) NOT NULL,
    close NUMERIC(18, 4) NOT NULL,
    volume NUMERIC(24, 4) NOT NULL,
    amount NUMERIC(24, 4),
    adjust_type VARCHAR(16) NOT NULL DEFAULT 'qfq',
    source VARCHAR(24) NOT NULL DEFAULT 'akshare',
    source_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_kline_daily_identity UNIQUE (instrument_id, trade_date, adjust_type, source)
);

CREATE INDEX IF NOT EXISTS ix_kline_daily_instrument_date ON kline_daily (instrument_id, trade_date);

CREATE TABLE IF NOT EXISTS watchlist_items (
    id BIGSERIAL PRIMARY KEY,
    instrument_id BIGINT NOT NULL REFERENCES instruments (id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_watchlist_items_instrument_id UNIQUE (instrument_id)
);

CREATE TABLE IF NOT EXISTS replay_sessions (
    id BIGSERIAL PRIMARY KEY,
    instrument_id BIGINT NOT NULL REFERENCES instruments (id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    start_date DATE NOT NULL,
    "current_date" DATE NOT NULL,
    hide_future BOOLEAN NOT NULL DEFAULT TRUE,
    adjust_type VARCHAR(16) NOT NULL DEFAULT 'qfq',
    indicator_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trades (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES replay_sessions (id) ON DELETE CASCADE,
    instrument_id BIGINT NOT NULL REFERENCES instruments (id) ON DELETE CASCADE,
    trade_date DATE NOT NULL,
    side VARCHAR(8) NOT NULL,
    quantity NUMERIC(24, 4) NOT NULL,
    price NUMERIC(18, 4) NOT NULL,
    price_rule VARCHAR(24) NOT NULL,
    fee NUMERIC(18, 4) NOT NULL DEFAULT 0,
    note TEXT,
    emotion_score INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_trades_side CHECK (side IN ('buy', 'sell')),
    CONSTRAINT ck_trades_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS ix_trades_session_date ON trades (session_id, trade_date);

CREATE TABLE IF NOT EXISTS trade_reviews (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES replay_sessions (id) ON DELETE CASCADE,
    start_trade_id BIGINT REFERENCES trades (id) ON DELETE SET NULL,
    end_trade_id BIGINT REFERENCES trades (id) ON DELETE SET NULL,
    title VARCHAR(128) NOT NULL,
    note TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fee_templates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    asset_type VARCHAR(16) NOT NULL,
    commission_rate NUMERIC(12, 8) NOT NULL,
    min_commission NUMERIC(18, 4) NOT NULL DEFAULT 0,
    stamp_tax_rate NUMERIC(12, 8) NOT NULL DEFAULT 0,
    transfer_rate NUMERIC(12, 8) NOT NULL DEFAULT 0,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO fee_templates (
    name,
    asset_type,
    commission_rate,
    min_commission,
    stamp_tax_rate,
    transfer_rate,
    config
)
SELECT
    'default stock fee',
    'stock',
    0.02500000,
    5.0000,
    0.05000000,
    0.00000000,
    '{"commissionMode":"rate","fixedCommission":0}'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM fee_templates WHERE name = 'default stock fee' AND asset_type = 'stock'
);

INSERT INTO fee_templates (
    name,
    asset_type,
    commission_rate,
    min_commission,
    stamp_tax_rate,
    transfer_rate,
    config
)
SELECT
    'default etf fee',
    'etf',
    0.02500000,
    5.0000,
    0.00000000,
    0.00000000,
    '{"commissionMode":"rate","fixedCommission":0}'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM fee_templates WHERE name = 'default etf fee' AND asset_type = 'etf'
);

INSERT INTO alembic_version (version_num)
VALUES ('0001_create_core_tables')
ON CONFLICT (version_num) DO NOTHING;

COMMIT;
