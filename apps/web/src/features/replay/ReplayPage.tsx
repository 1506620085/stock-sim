import { useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { KLineChartPanel } from "./KLineChartPanel";
import { instruments, marketData } from "./mockData";
import type { IndicatorSettings, KLineBar, TradeRecord, TradeSide } from "./types";

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

export function ReplayPage() {
  const [activeCode, setActiveCode] = useState("600519");
  const [watchlist, setWatchlist] = useState(["600519", "510300"]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(210);
  const [hideFuture, setHideFuture] = useState(true);
  const [indicators, setIndicators] = useState(defaultIndicators);
  const [tradeSide, setTradeSide] = useState<TradeSide>("buy");
  const [quantity, setQuantity] = useState(1000);
  const [fee, setFee] = useState(5);
  const [note, setNote] = useState("");
  const [trades, setTrades] = useState<TradeRecord[]>([]);

  const activeInstrument = instruments.find((instrument) => instrument.code === activeCode) ?? instruments[0];
  const bars = marketData[activeCode] ?? [];
  const normalizedIndex = Math.min(Math.max(selectedIndex, 0), Math.max(bars.length - 1, 0));
  const selectedBar = bars[normalizedIndex] ?? bars[0];
  const visibleEnd = hideFuture ? normalizedIndex + 1 : bars.length;
  const visibleStart = Math.max(0, visibleEnd - 120);
  const visibleBars = bars.slice(visibleStart, visibleEnd);
  const activeTrades = trades.filter((trade) => trade.code === activeCode);

  const searchResults = useMemo(() => {
    const text = query.trim().toLowerCase();
    return instruments
      .filter((instrument) => `${instrument.code}${instrument.name}${instrument.type}`.toLowerCase().includes(text))
      .slice(0, 6);
  }, [query]);

  const position = useMemo(() => calculatePosition(activeTrades, selectedBar), [activeTrades, selectedBar]);

  function addToWatchlist(code: string) {
    setWatchlist((items) => (items.includes(code) ? items : [...items, code]));
    setActiveCode(code);
    setSelectedIndex(Math.min(210, Math.max((marketData[code] ?? []).length - 1, 0)));
  }

  function updateIndicator<K extends keyof IndicatorSettings>(key: K, value: IndicatorSettings[K]) {
    setIndicators((current) => ({ ...current, [key]: value }));
  }

  function resetIndicators() {
    setIndicators(defaultIndicators);
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
        <SearchPanel query={query} results={searchResults} watchlist={watchlist} onAdd={addToWatchlist} onQueryChange={setQuery} />
        <WatchlistPanel activeCode={activeCode} codes={watchlist} onSelect={addToWatchlist} />
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
            </div>
            <div className="day-controls">
              <button type="button" onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))} aria-label="前一天">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => setSelectedIndex((index) => Math.min(bars.length - 1, index + 1))} aria-label="后一天">
                <ChevronRight size={18} />
              </button>
              <label className="switch">
                <input checked={hideFuture} onChange={(event) => setHideFuture(event.target.checked)} type="checkbox" />
                <span>隐藏未来</span>
              </label>
            </div>
          </div>

          <div className="chart-meta">
            <span>当前复盘日：{selectedBar?.date}</span>
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
  onAdd,
  onQueryChange,
}: {
  query: string;
  results: typeof instruments;
  watchlist: string[];
  onAdd: (code: string) => void;
  onQueryChange: (value: string) => void;
}) {
  return (
    <section className="panel">
      <label className="field-label" htmlFor="stockSearch">
        搜索股票 / ETF
      </label>
      <div className="search-row">
        <input id="stockSearch" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="输入代码或名称" />
        <button type="button" onClick={() => results[0] && onAdd(results[0].code)}>
          加入
        </button>
      </div>
      <div className="stock-list compact-list">
        {results.map((instrument) => (
          <button className="stock-row" key={instrument.code} onClick={() => onAdd(instrument.code)} type="button">
            <span>
              <strong>
                {instrument.code} {instrument.name}
              </strong>
              <small>
                {instrument.market} / {instrument.type}
              </small>
            </span>
            <em>{watchlist.includes(instrument.code) ? "已自选" : "可加入"}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function WatchlistPanel({ activeCode, codes, onSelect }: { activeCode: string; codes: string[]; onSelect: (code: string) => void }) {
  return (
    <section className="panel">
      <div className="section-header">
        <h2>自选</h2>
        <span>{codes.length}</span>
      </div>
      <div className="stock-list">
        {codes.map((code) => {
          const instrument = instruments.find((item) => item.code === code);
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
              <em>{marketData[code]?.length ?? 0} 根</em>
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
          <RotateCcw size={14} />
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
