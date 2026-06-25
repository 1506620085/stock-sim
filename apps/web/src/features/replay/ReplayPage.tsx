import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, RefreshCcw, Search, CloudCog } from "lucide-react";
import { createInstrument, loadInstrumentKlines, searchInstruments, syncInstrumentKlines } from "./api";
import { KLineChartPanel } from "./KLineChartPanel";
import { instruments as fallbackInstruments, marketData as fallbackMarketData } from "./mockData";
import type { Instrument, IndicatorSettings, KLineBar, TradeRecord, TradeSide } from "./types";

const defaultIndicators: IndicatorSettings = {
  maFast: 5,
  maMid: 10,
  maSlow: 20,
  showMa: true,
  showBoll: true,
  showVolume: true,
  showKdj: true,
  showMacd: true,
};

const formatNumber = (value: number) =>
  value.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

const fallbackLookup = new Map(fallbackInstruments.map((item) => [item.code, item]));

export function ReplayPage() {
  const [query, setQuery] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>(["600519", "510300"]);
  const [knownInstruments, setKnownInstruments] = useState<Record<string, Instrument>>(() => Object.fromEntries(fallbackInstruments.map((item) => [item.code, item])));
  const [activeCode, setActiveCode] = useState("600519");
  const [selectedIndex, setSelectedIndex] = useState(210);
  const [hideFuture, setHideFuture] = useState(true);
  const [indicators, setIndicators] = useState(defaultIndicators);
  const [tradeSide, setTradeSide] = useState<TradeSide>("buy");
  const [quantity, setQuantity] = useState(1000);
  const [fee, setFee] = useState(5);
  const [note, setNote] = useState("");
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [remoteResults, setRemoteResults] = useState<Instrument[]>([]);
  const [bars, setBars] = useState<KLineBar[]>(fallbackMarketData[activeCode] ?? []);
  const [activeInstrument, setActiveInstrument] = useState<Instrument>(fallbackLookup.get(activeCode) ?? fallbackInstruments[0]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingBars, setLoadingBars] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const keyword = query.trim();
    if (!keyword) {
      setRemoteResults([]);
      return;
    }

    setLoadingSearch(true);
    searchInstruments(keyword)
      .then((results) => {
        if (!cancelled) setRemoteResults(results);
      })
      .catch(() => {
        if (!cancelled) setRemoteResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSearch(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const instrumentId = activeInstrument.id;

    if (!instrumentId) {
      setBars(fallbackMarketData[activeCode] ?? []);
      return;
    }

    setLoadingBars(true);
    loadInstrumentKlines(instrumentId, { adjust: "qfq" })
      .then((items) => {
        if (!cancelled) {
          setBars(items.length ? items : fallbackMarketData[activeCode] ?? []);
          setSelectedIndex((current) => Math.min(current, Math.max(items.length - 1, 0)));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBars(fallbackMarketData[activeCode] ?? []);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBars(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCode, activeInstrument.id]);

  const normalizedIndex = Math.min(Math.max(selectedIndex, 0), Math.max(bars.length - 1, 0));
  const selectedBar = bars[normalizedIndex] ?? bars[0];
  const visibleEnd = hideFuture ? normalizedIndex + 1 : bars.length;
  const visibleStart = Math.max(0, visibleEnd - 120);
  const visibleBars = bars.slice(visibleStart, visibleEnd);
  const activeTrades = trades.filter((trade) => trade.code === activeCode);
  const activeDataSource = activeInstrument.source ?? (activeInstrument.id ? "database" : "mock");
  const searchResults = useMemo(() => {
    const text = query.trim().toLowerCase();
    const localResults = fallbackInstruments.filter((instrument) => `${instrument.code}${instrument.name}${instrument.type}`.toLowerCase().includes(text));
    const merged = [...remoteResults, ...localResults];
    const seen = new Set<string>();
    return merged.filter((instrument) => {
      if (seen.has(instrument.code)) return false;
      seen.add(instrument.code);
      return true;
    });
  }, [query, remoteResults]);

  const position = useMemo(() => calculatePosition(activeTrades, selectedBar), [activeTrades, selectedBar]);

  function switchInstrument(instrument: Instrument) {
    setKnownInstruments((items) => ({ ...items, [instrument.code]: instrument }));
    setActiveCode(instrument.code);
    setActiveInstrument(instrument);
    setSelectedIndex(0);
    setSyncMessage("");
    setErrorMessage("");
  }

  async function addToWatchlist(instrument: Instrument) {
    setErrorMessage("");
    try {
      const savedInstrument = instrument.id || !instrument.symbol ? instrument : await createInstrument(instrument);
      setKnownInstruments((items) => ({ ...items, [savedInstrument.code]: savedInstrument }));
      setWatchlist((items) => (items.includes(savedInstrument.code) ? items : [...items, savedInstrument.code]));
      switchInstrument(savedInstrument);
    } catch (error) {
      if (!instrument.symbol) {
        setWatchlist((items) => (items.includes(instrument.code) ? items : [...items, instrument.code]));
        switchInstrument(instrument);
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "标的入库失败");
    }
  }

  function updateIndicator<K extends keyof IndicatorSettings>(key: K, value: IndicatorSettings[K]) {
    setIndicators((current) => ({ ...current, [key]: value }));
  }

  function resetIndicators() {
    setIndicators(defaultIndicators);
  }

  async function syncCurrentInstrument() {
    if (!activeInstrument.id) {
      setErrorMessage("当前标的还没有入库，先从搜索结果里加入自选或保存为标的后再同步。");
      return;
    }

    setSyncMessage("");
    setErrorMessage("");
    try {
      const result = await syncInstrumentKlines(activeInstrument.id, { adjust: "qfq" });
      setSyncMessage(`已同步 ${result.rows_written} 条，最新交易日 ${result.latest_trade_date ?? "-"}`);
      const refreshed = await loadInstrumentKlines(activeInstrument.id, { adjust: "qfq" });
      setBars(refreshed);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "同步失败");
    }
  }

  function submitTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBar) return;

    const price = tradeSide === "buy" ? selectedBar.high : selectedBar.low;
    setTrades((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        code: activeCode,
        side: tradeSide,
        date: selectedBar.date,
        index: normalizedIndex,
        price,
        quantity,
        fee,
        note,
      },
    ]);
    setNote("");
  }

  return (
    <section className="replay-page">
      <aside className="replay-sidebar">
        <SearchPanel
          loading={loadingSearch}
          query={query}
          results={searchResults}
          watchlist={watchlist}
          onAdd={(instrument) => void addToWatchlist(instrument)}
          onQueryChange={setQuery}
        />
        <WatchlistPanel activeCode={activeCode} codes={watchlist} instruments={knownInstruments} onSelect={(code) => {
          const matched = knownInstruments[code] ?? searchResults.find((item) => item.code === code) ?? fallbackLookup.get(code);
          if (matched) switchInstrument(matched);
        }} />
        <IndicatorPanel indicators={indicators} onReset={resetIndicators} onUpdate={updateIndicator} />
      </aside>

      <section className="replay-center">
        <div className="panel chart-panel">
          <div className="chart-toolbar">
            <div>
              <p className="eyebrow">
                {activeInstrument.market} / {activeInstrument.type}
              </p>
              <h2>
                {activeInstrument.code} {activeInstrument.name}
              </h2>
              <p className="source-line">
                数据源：{activeDataSource}
                {loadingBars ? " · 加载中" : ""}
                {syncMessage ? ` · ${syncMessage}` : ""}
                {errorMessage ? ` · ${errorMessage}` : ""}
              </p>
            </div>
            <div className="day-controls">
              <button type="button" onClick={syncCurrentInstrument} aria-label="同步K线">
                <CloudCog size={18} />
              </button>
              <button type="button" onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))} aria-label="前一日">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => setSelectedIndex((index) => Math.min(bars.length - 1, index + 1))} aria-label="后一日">
                <ChevronRight size={18} />
              </button>
              <label className="switch">
                <input checked={hideFuture} onChange={(event) => setHideFuture(event.target.checked)} type="checkbox" />
                <span>隐藏未来</span>
              </label>
            </div>
          </div>

          <div className="chart-meta">
            <span>当前复盘日：{selectedBar?.date ?? "-"}</span>
            <span>
              开 {formatNumber(selectedBar?.open ?? 0)} 高 {formatNumber(selectedBar?.high ?? 0)} 低 {formatNumber(selectedBar?.low ?? 0)} 收{" "}
              {formatNumber(selectedBar?.close ?? 0)}
            </span>
          </div>

          <KLineChartPanel bars={visibleBars} code={activeCode} indicators={indicators} selectedDate={selectedBar?.date} />
        </div>
      </section>

      <aside className="trade-column">
        <TradePanel
          fee={fee}
          note={note}
          quantity={quantity}
          selectedBar={selectedBar}
          side={tradeSide}
          onFeeChange={setFee}
          onNoteChange={setNote}
          onQuantityChange={setQuantity}
          onSideChange={setTradeSide}
          onSubmit={submitTrade}
        />
        <PnlPanel position={position} />
        <TradeHistory trades={activeTrades} />
      </aside>
    </section>
  );
}

function SearchPanel({
  query,
  results,
  watchlist,
  loading,
  onAdd,
  onQueryChange,
}: {
  query: string;
  results: Instrument[];
  watchlist: string[];
  loading: boolean;
  onAdd: (instrument: Instrument) => void;
  onQueryChange: (value: string) => void;
}) {
  return (
    <section className="panel">
      <label className="field-label" htmlFor="stockSearch">
        搜索股票 / ETF
      </label>
      <div className="search-row">
        <input id="stockSearch" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="输入代码或名称" />
        <button type="button" aria-label="搜索">
          <Search size={16} />
        </button>
      </div>
      <div className="stock-list compact-list">
        {loading ? <p className="empty-copy">正在搜索行情...</p> : null}
        {results.map((instrument) => (
          <button className="stock-row" key={`${instrument.source ?? "mock"}-${instrument.code}`} onClick={() => onAdd(instrument)} type="button">
            <span>
              <strong>
                {instrument.code} {instrument.name}
              </strong>
              <small>
                {instrument.market} / {instrument.type}
              </small>
            </span>
            <em>{watchlist.includes(instrument.code) ? "已加入" : instrument.source ?? "mock"}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function WatchlistPanel({ activeCode, codes, instruments, onSelect }: { activeCode: string; codes: string[]; instruments: Record<string, Instrument>; onSelect: (code: string) => void }) {
  return (
    <section className="panel">
      <div className="section-header">
        <h2>自选</h2>
        <span>{codes.length}</span>
      </div>
      <div className="stock-list">
        {codes.map((code) => {
          const instrument = instruments[code] ?? fallbackLookup.get(code);
          if (!instrument) return null;
          return (
            <button className={`stock-row ${code === activeCode ? "active" : ""}`} key={code} onClick={() => onSelect(code)} type="button">
              <span>
                <strong>
                  {instrument.code} {instrument.name}
                </strong>
                <small>
                  {instrument.market} / {instrument.type}
                </small>
              </span>
              <em>{instrument.id ? "可同步" : `${fallbackMarketData[code]?.length ?? 0} 根`}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function IndicatorPanel({
  indicators,
  onReset,
  onUpdate,
}: {
  indicators: IndicatorSettings;
  onReset: () => void;
  onUpdate: <K extends keyof IndicatorSettings>(key: K, value: IndicatorSettings[K]) => void;
}) {
  return (
    <section className="panel">
      <div className="section-header">
        <h2>指标设置</h2>
        <button className="text-button" onClick={onReset} type="button">
          <RefreshCcw size={14} />
          重置
        </button>
      </div>
      <div className="input-grid">
        <label>
          MA1
          <input value={indicators.maFast} min={2} max={250} type="number" onChange={(event) => onUpdate("maFast", Number(event.target.value))} />
        </label>
        <label>
          MA2
          <input value={indicators.maMid} min={2} max={250} type="number" onChange={(event) => onUpdate("maMid", Number(event.target.value))} />
        </label>
        <label>
          MA3
          <input value={indicators.maSlow} min={2} max={250} type="number" onChange={(event) => onUpdate("maSlow", Number(event.target.value))} />
        </label>
      </div>
      <div className="toggle-grid">
        <Toggle label="MA" checked={indicators.showMa} onChange={(checked) => onUpdate("showMa", checked)} />
        <Toggle label="BOLL" checked={indicators.showBoll} onChange={(checked) => onUpdate("showBoll", checked)} />
        <Toggle label="成交量" checked={indicators.showVolume} onChange={(checked) => onUpdate("showVolume", checked)} />
        <Toggle label="KDJ" checked={indicators.showKdj} onChange={(checked) => onUpdate("showKdj", checked)} />
        <Toggle label="MACD" checked={indicators.showMacd} onChange={(checked) => onUpdate("showMacd", checked)} />
      </div>
    </section>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="check-row">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function TradePanel({
  fee,
  note,
  quantity,
  selectedBar,
  side,
  onFeeChange,
  onNoteChange,
  onQuantityChange,
  onSideChange,
  onSubmit,
}: {
  fee: number;
  note: string;
  quantity: number;
  selectedBar?: KLineBar;
  side: TradeSide;
  onFeeChange: (value: number) => void;
  onNoteChange: (value: string) => void;
  onQuantityChange: (value: number) => void;
  onSideChange: (value: TradeSide) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const price = selectedBar ? (side === "buy" ? selectedBar.high : selectedBar.low) : 0;

  return (
    <form className="panel trade-panel" onSubmit={onSubmit}>
      <div className="section-header">
        <h2>模拟交易</h2>
        <span>{selectedBar?.date ?? "-"}</span>
      </div>
      <div className="trade-type">
        <label>
          <input checked={side === "buy"} onChange={() => onSideChange("buy")} name="side" type="radio" />
          买入
        </label>
        <label>
          <input checked={side === "sell"} onChange={() => onSideChange("sell")} name="side" type="radio" />
          卖出
        </label>
      </div>
      <div className="input-grid two-cols">
        <label>
          份额
          <input min={1} step={100} type="number" value={quantity} onChange={(event) => onQuantityChange(Number(event.target.value))} />
        </label>
        <label>
          手续费
          <input min={0} step={0.01} type="number" value={fee} onChange={(event) => onFeeChange(Number(event.target.value))} />
        </label>
      </div>
      <div className="quote-box">
        {side === "buy" ? "买入按当日最高价" : "卖出按当日最低价"}：<strong>{formatNumber(price)}</strong>
      </div>
      <label className="full-field">
        交易笔记
        <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} rows={4} placeholder="写下买入/卖出理由、情绪状态和事后观察" />
      </label>
      <button className="primary-button" type="submit">
        记录买卖点
      </button>
    </form>
  );
}

function PnlPanel({ position }: { position: ReturnType<typeof calculatePosition> }) {
  return (
    <section className="panel">
      <div className="section-header">
        <h2>盈亏与压力</h2>
        <span className={position.total >= 0 ? "positive" : "negative"}>{formatNumber(position.total)}</span>
      </div>
      <div className="stat-grid">
        <article>
          <span>持仓</span>
          <strong>{position.quantity.toLocaleString("zh-CN")}</strong>
        </article>
        <article>
          <span>平均成本</span>
          <strong>{position.avgCost ? formatNumber(position.avgCost) : "-"}</strong>
        </article>
        <article>
          <span>已实现</span>
          <strong className={position.realized >= 0 ? "positive" : "negative"}>{formatNumber(position.realized)}</strong>
        </article>
        <article>
          <span>当前浮盈亏</span>
          <strong className={position.floating >= 0 ? "positive" : "negative"}>{formatNumber(position.floating)}</strong>
        </article>
      </div>
    </section>
  );
}

function TradeHistory({ trades }: { trades: TradeRecord[] }) {
  return (
    <section className="panel">
      <div className="section-header">
        <h2>交易记录</h2>
        <span>{trades.length}</span>
      </div>
      <div className="trade-history">
        {trades.length ? (
          [...trades].reverse().map((trade) => (
            <article className={`trade-row ${trade.side}`} key={trade.id}>
              <strong>
                {trade.side === "buy" ? "买入" : "卖出"} {trade.date}
              </strong>
              <span>
                {formatNumber(trade.price)} / {trade.quantity.toLocaleString("zh-CN")} 份
              </span>
              <p>{trade.note || "未填写笔记"}</p>
            </article>
          ))
        ) : (
          <p className="empty-copy">还没有交易记录。选择复盘日后记录买入或卖出。</p>
        )}
      </div>
    </section>
  );
}

function calculatePosition(trades: TradeRecord[], currentBar?: KLineBar) {
  let quantity = 0;
  let cost = 0;
  let realized = 0;

  for (const trade of [...trades].sort((a, b) => a.index - b.index)) {
    if (trade.side === "buy") {
      quantity += trade.quantity;
      cost += trade.price * trade.quantity + trade.fee;
    } else {
      const sellQuantity = Math.min(quantity, trade.quantity);
      const avgCost = quantity > 0 ? cost / quantity : 0;
      realized += trade.price * sellQuantity - trade.fee - avgCost * sellQuantity;
      quantity -= sellQuantity;
      cost -= avgCost * sellQuantity;
    }
  }

  const avgCost = quantity > 0 ? cost / quantity : 0;
  const floating = currentBar && quantity > 0 ? (currentBar.close - avgCost) * quantity : 0;
  return {
    quantity,
    cost,
    avgCost,
    realized,
    floating,
    total: realized + floating,
  };
}
