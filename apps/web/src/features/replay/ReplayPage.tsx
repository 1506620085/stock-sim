import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, RefreshCcw, Search, CloudCog } from "lucide-react";
import { showError, showInfo, showSuccess } from "../../components/ToastProvider";
import type { ApiError } from "../../api/client";
import { createInstrument, createReplaySession, createSessionTrade, createTradeReview, addWatchlistItem, loadInstrumentKlines, loadReplaySessions, loadSessionTrades, loadTradeReviews, loadWatchlist, searchInstruments, syncInstrumentKlines, updateReplaySession } from "./api";
import { KLineChartPanel } from "./KLineChartPanel";
import { loadInstruments, loadPreferences } from "../settings/api";
import type { Instrument, IndicatorSettings, KLineBar, ReplaySession, TradeRecord, TradeReview, TradeSide } from "./types";

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

const adjustLabel = (value: string) => ({ none: "不复权", qfq: "前复权", hfq: "后复权" })[value] ?? value;

export function ReplayPage() {
  const [query, setQuery] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [knownInstruments, setKnownInstruments] = useState<Record<string, Instrument>>({});
  const [activeInstrument, setActiveInstrument] = useState<Instrument | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hideFuture, setHideFuture] = useState(true);
  const [indicators, setIndicators] = useState(defaultIndicators);
  const [tradeSide, setTradeSide] = useState<TradeSide>("buy");
  const [quantity, setQuantity] = useState(1000);
  const [fee, setFee] = useState(5);
  const [note, setNote] = useState("");
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [tradeReviews, setTradeReviews] = useState<TradeReview[]>([]);
  const [remoteResults, setRemoteResults] = useState<Instrument[]>([]);
  const [bars, setBars] = useState<KLineBar[]>([]);
  const [replaySession, setReplaySession] = useState<ReplaySession | null>(null);
  const [jumpDate, setJumpDate] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingBars, setLoadingBars] = useState(false);
  const [syncingBars, setSyncingBars] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [preferences] = useState(() => loadPreferences());
  const activeCode = activeInstrument?.code ?? "";
  const activeAdjustType = replaySession?.adjustType ?? preferences.adjustType;

  useEffect(() => {
    let cancelled = false;
    setLoadingWatchlist(true);
    Promise.all([loadWatchlist(), loadInstruments()])
      .then(([items, instruments]) => {
        if (cancelled) return;
        const byId = new Map(instruments.filter((item) => item.id).map((item) => [item.id as number, item]));
        const codes: string[] = [];
        const known: Record<string, Instrument> = {};
        for (const item of items) {
          const instrument = byId.get(item.instrument_id);
          if (!instrument) continue;
          codes.push(instrument.code);
          known[instrument.code] = instrument;
        }
        setWatchlist(codes);
        setKnownInstruments(known);
        if (codes[0] && known[codes[0]]) {
          setActiveInstrument(known[codes[0]]);
          setSelectedIndex(0);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingWatchlist(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
      .catch((error: ApiError) => {
        if (!cancelled) setRemoteResults([]);
        if (!error?.notified) showError(error instanceof Error ? error.message : "搜索失败");
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
    const instrumentId = activeInstrument?.id;

    if (!instrumentId) {
      setBars([]);
      return;
    }

    const id = instrumentId;

    async function loadBars() {
      setLoadingBars(true);
      try {
        let items = await loadInstrumentKlines(id, { adjust: activeAdjustType });
        if (!items.length) {
          try {
            const result = await syncInstrumentKlines(id, { adjust: activeAdjustType });
            items = await loadInstrumentKlines(id, { adjust: activeAdjustType });
            if (!cancelled && items.length) {
              showSuccess(`已同步 ${result.rows_fetched} 条 K 线`);
            } else if (!cancelled) {
              showInfo("暂无 K 线数据，请检查 AKShare 连接或稍后点击同步重试");
            }
          } catch {
            // apiFetch 已弹出错误提示
          }
        }
        if (!cancelled) {
          setBars(items);
          setSelectedIndex((current) => Math.min(current, Math.max(items.length - 1, 0)));
        }
      } catch {
        if (!cancelled) setBars([]);
      } finally {
        if (!cancelled) setLoadingBars(false);
      }
    }

    void loadBars();

    return () => {
      cancelled = true;
    };
  }, [activeAdjustType, activeInstrument?.id]);

  useEffect(() => {
    let cancelled = false;
    const instrumentId = activeInstrument?.id;
    if (!instrumentId || bars.length === 0) {
      setReplaySession(null);
      return;
    }

    setLoadingSession(true);
    loadReplaySessions(instrumentId)
      .then(async (sessions) => {
        if (cancelled) return;

        const existingSession = sessions[0];
        if (existingSession) {
          applyReplaySession(existingSession, bars);
          return;
        }

        const startDate = bars[0].date;
        const currentDate = bars[Math.min(Math.floor(bars.length * 0.6), bars.length - 1)]?.date ?? startDate;
        const createdSession = await createReplaySession({
          instrumentId,
          name: `${activeInstrument.code} ${activeInstrument.name} 复盘`,
          startDate,
          currentDate,
          hideFuture,
          adjustType: activeAdjustType,
          indicatorConfig: indicators,
        });
        if (!cancelled) applyReplaySession(createdSession, bars);
      })
      .catch(() => {
        if (!cancelled) setReplaySession(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeAdjustType, activeInstrument?.id, bars]);

  useEffect(() => {
    let cancelled = false;
    if (!replaySession || !activeInstrument?.id) {
      return;
    }

    loadSessionTrades(replaySession.id, activeCode)
      .then((items) => {
        if (cancelled) return;
        const indexedTrades = items.map((trade) => ({
          ...trade,
          index: findBarIndexByDate(bars, trade.date),
        }));
        setTrades((current) => [...current.filter((trade) => trade.sessionId !== replaySession.id), ...indexedTrades]);
      })
      .catch(() => undefined);

    loadTradeReviews(replaySession.id)
      .then((items) => {
        if (!cancelled) setTradeReviews(items);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [replaySession?.id, activeInstrument?.id, activeCode, bars]);

  const normalizedIndex = Math.min(Math.max(selectedIndex, 0), Math.max(bars.length - 1, 0));
  const selectedBar = bars[normalizedIndex] ?? bars[0];
  const visibleEnd = hideFuture ? normalizedIndex + 1 : bars.length;
  const visibleStart = Math.max(0, visibleEnd - 120);
  const visibleBars = bars.slice(visibleStart, visibleEnd);
  const replayBars = bars.slice(0, normalizedIndex + 1);
  const activeTrades = trades.filter((trade) => trade.code === activeCode);
  const replayTrades = activeTrades.filter((trade) => !selectedBar || trade.date <= selectedBar.date);
  const visibleTrades = hideFuture ? replayTrades : activeTrades;
  const activeDataSource = activeInstrument?.source ?? (activeInstrument?.id ? "database" : "-");
  const configuredDataSource = preferences.dataSource === "akshare" ? "AKShare" : "Tushare Pro";
  const searchResults = remoteResults;

  const position = useMemo(() => calculatePosition(replayTrades, selectedBar, replayBars), [replayTrades, selectedBar, replayBars]);

  function applyReplaySession(session: ReplaySession, sourceBars: KLineBar[]) {
    const index = findBarIndexByDate(sourceBars, session.currentDate);
    setReplaySession(session);
    setHideFuture(session.hideFuture);
    setIndicators({ ...defaultIndicators, ...session.indicatorConfig });
    setSelectedIndex(index);
    setJumpDate(sourceBars[index]?.date ?? session.currentDate);
  }

  function switchInstrument(instrument: Instrument) {
    setKnownInstruments((items) => ({ ...items, [instrument.code]: instrument }));
    setActiveInstrument(instrument);
    setSelectedIndex(0);
    setJumpDate("");
    setReplaySession(null);
  }

  async function addToWatchlist(instrument: Instrument) {
    try {
      if (!instrument.symbol || !instrument.exchange || !instrument.assetType) {
        showError("搜索结果缺少标的信息，无法入库。");
        return;
      }
      const savedInstrument = instrument.id ? instrument : await createInstrument(instrument);
      if (!savedInstrument.id) {
        showError("标的入库失败。");
        return;
      }
      await addWatchlistItem(savedInstrument.id);
      setKnownInstruments((items) => ({ ...items, [savedInstrument.code]: savedInstrument }));
      setWatchlist((items) => (items.includes(savedInstrument.code) ? items : [...items, savedInstrument.code]));
      switchInstrument(savedInstrument);
      showSuccess("已加入自选");
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  function syncReplaySession(sessionId: number, payload: Parameters<typeof updateReplaySession>[1]) {
    void updateReplaySession(sessionId, payload)
      .then(setReplaySession)
      .catch(() => showError("复盘状态同步失败"));
  }

  function updateIndicator<K extends keyof IndicatorSettings>(key: K, value: IndicatorSettings[K]) {
    setIndicators((current) => {
      const next = { ...current, [key]: value };
      if (replaySession) {
        syncReplaySession(replaySession.id, { indicatorConfig: next });
      }
      return next;
    });
  }

  function resetIndicators() {
    setIndicators(defaultIndicators);
    if (replaySession) {
      syncReplaySession(replaySession.id, { indicatorConfig: defaultIndicators });
    }
  }

  function updateHideFuture(checked: boolean) {
    setHideFuture(checked);
    if (replaySession) {
      syncReplaySession(replaySession.id, { hideFuture: checked });
    }
  }

  function moveReplayDate(delta: number) {
    commitReplayDate(normalizedIndex + delta);
  }

  function commitReplayDate(rawIndex: number) {
    if (!bars.length) return;
    const nextIndex = Math.min(Math.max(rawIndex, 0), bars.length - 1);
    const nextDate = bars[nextIndex].date;
    setSelectedIndex(nextIndex);
    setJumpDate(nextDate);
    if (replaySession) {
      syncReplaySession(replaySession.id, { currentDate: nextDate });
    }
  }

  function jumpToDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jumpDate) return;
    commitReplayDate(findBarIndexByDate(bars, jumpDate));
  }

  async function syncCurrentInstrument() {
    if (!activeInstrument?.id) {
      showInfo("请先从搜索结果加入自选，再同步 K 线。");
      return;
    }

    setSyncingBars(true);
    try {
      const result = await syncInstrumentKlines(activeInstrument.id, { adjust: activeAdjustType });
      const refreshed = await loadInstrumentKlines(activeInstrument.id, { adjust: activeAdjustType });
      setBars(refreshed);
      if (refreshed.length) {
        showSuccess(`已同步 ${result.rows_fetched} 条，最新交易日 ${result.latest_trade_date ?? "-"}`);
      } else {
        showInfo("同步完成，但未获取到 K 线数据，请检查 AKShare 或稍后重试");
      }
    } catch (error) {
      const apiError = error as ApiError;
      if (!apiError?.notified) {
        showError(error instanceof Error ? error.message : "K 线同步失败");
      }
    } finally {
      setSyncingBars(false);
    }
  }

  async function submitTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBar || !replaySession || !activeInstrument?.id) {
      showInfo("请先选择标的、同步 K 线并创建复盘 session 后再交易。");
      return;
    }

    try {
      const createdTrade = await createSessionTrade(replaySession.id, activeCode, {
        side: tradeSide,
        quantity,
        fee,
        note,
      });
      setTrades((items) => [
        ...items,
        {
          ...createdTrade,
          index: findBarIndexByDate(bars, createdTrade.date),
        },
      ]);
      setNote("");
      showSuccess(tradeSide === "buy" ? "买入记录已保存" : "卖出记录已保存");
    } catch {
      // apiFetch 已弹出错误提示
    }
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
        <WatchlistPanel
          activeCode={activeCode}
          codes={watchlist}
          instruments={knownInstruments}
          loading={loadingWatchlist}
          onSelect={(code) => {
            const matched = knownInstruments[code] ?? searchResults.find((item) => item.code === code);
            if (matched) switchInstrument(matched);
          }}
        />
        <IndicatorPanel indicators={indicators} onReset={resetIndicators} onUpdate={updateIndicator} />
      </aside>

      <section className="replay-center">
        <div className="panel chart-panel">
          {activeInstrument ? (
            <>
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
                {` · 配置源：${configuredDataSource}`}
                {` · 复权：${adjustLabel(activeAdjustType)}`}
                {loadingBars ? " · 加载中" : ""}
                {syncingBars ? " · 同步中" : ""}
                {loadingSession ? " · 复盘状态同步中" : ""}
                {replaySession ? ` · Session #${replaySession.id}` : ""}
              </p>
            </div>
            <div className="day-controls">
              <button className="text-button" disabled={syncingBars || loadingBars} onClick={() => void syncCurrentInstrument()} type="button" aria-label="同步K线">
                <CloudCog size={18} className={syncingBars ? "spinning" : undefined} />
              </button>
              <button type="button" onClick={() => moveReplayDate(-1)} aria-label="前一日">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => moveReplayDate(1)} aria-label="后一日">
                <ChevronRight size={18} />
              </button>
              <label className="switch">
                <input checked={hideFuture} onChange={(event) => updateHideFuture(event.target.checked)} type="checkbox" />
                <span>隐藏未来</span>
              </label>
            </div>
          </div>

          <div className="chart-meta">
            <span>当前复盘日：{selectedBar?.date ?? "-"}</span>
            <form className="jump-date-form" onSubmit={jumpToDate}>
              <input value={jumpDate} onChange={(event) => setJumpDate(event.target.value)} type="date" />
              <button type="submit">跳转</button>
            </form>
            <span>
              开 {formatNumber(selectedBar?.open ?? 0)} 高 {formatNumber(selectedBar?.high ?? 0)} 低 {formatNumber(selectedBar?.low ?? 0)} 收{" "}
              {formatNumber(selectedBar?.close ?? 0)}
            </span>
          </div>

          {loadingBars || syncingBars ? (
            <div className="panel empty-state chart-empty-state chart-loading-state">
              <p className="eyebrow">K 线</p>
              <h2>{syncingBars ? "正在同步行情" : "正在加载行情"}</h2>
              <p className="empty-copy">请稍候，数据将从 AKShare 写入数据库后显示。</p>
            </div>
          ) : bars.length ? (
            <KLineChartPanel
              bars={visibleBars}
              code={activeCode}
              indicators={indicators}
              painPoint={{ date: position.worstLowDate, price: position.worstLowPrice }}
              selectedDate={selectedBar?.date}
              trades={visibleTrades}
            />
          ) : (
            <div className="panel empty-state chart-empty-state">
              <p className="eyebrow">K 线</p>
              <h2>暂无行情数据</h2>
              <p className="empty-copy">搜索只返回标的信息，K 线需从 AKShare 同步到数据库后才会显示。请点击上方云同步按钮，或重新选择该标的触发自动同步。</p>
              <button className="primary-button" disabled={syncingBars} onClick={() => void syncCurrentInstrument()} type="button">
                <CloudCog size={16} className={syncingBars ? "spinning" : undefined} />
                同步 K 线
              </button>
            </div>
          )}
            </>
          ) : (
            <div className="panel empty-state chart-empty-state">
              <p className="eyebrow">Replay</p>
              <h2>请选择或加入自选标的</h2>
              <p className="empty-copy">搜索股票/ETF 代码并加入自选，同步 K 线后即可开始复盘。</p>
            </div>
          )}
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
        <TradeReviewPanel
          bars={bars}
          reviews={tradeReviews}
          sessionId={replaySession?.id ?? null}
          trades={activeTrades}
          onCreate={(review) => setTradeReviews((items) => [review, ...items])}
        />
        <TradeHistory trades={visibleTrades} />
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
        {!loading && query.trim() && !results.length ? <p className="empty-copy">未找到匹配标的。</p> : null}
        {results.map((instrument) => (
          <button className="stock-row" key={`${instrument.source ?? "remote"}-${instrument.code}`} onClick={() => onAdd(instrument)} type="button">
            <span>
              <strong>
                {instrument.code} {instrument.name}
              </strong>
              <small>
                {instrument.market} / {instrument.type}
              </small>
            </span>
            <em>{watchlist.includes(instrument.code) ? "已加入" : instrument.source ?? "远程"}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function WatchlistPanel({
  activeCode,
  codes,
  instruments,
  loading,
  onSelect,
}: {
  activeCode: string;
  codes: string[];
  instruments: Record<string, Instrument>;
  loading: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <section className="panel">
      <div className="section-header">
        <h2>自选</h2>
        <span>{codes.length}</span>
      </div>
      <div className="stock-list">
        {loading ? <p className="empty-copy">正在加载自选...</p> : null}
        {!loading && !codes.length ? <p className="empty-copy">还没有自选。搜索代码并点击结果加入。</p> : null}
        {codes.map((code) => {
          const instrument = instruments[code];
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
              <em>{instrument.id ? "已入库" : "待入库"}</em>
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
  const pressurePercent = Math.min(Math.max(position.pressurePercent, 0), 100);

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
        <article>
          <span>当前低点浮亏</span>
          <strong className={position.floatingLow >= 0 ? "positive" : "negative"}>{formatNumber(position.floatingLow)}</strong>
        </article>
        <article>
          <span>买入后最大浮亏</span>
          <strong className={position.maxFloatingLoss >= 0 ? "positive" : "negative"}>{formatNumber(position.maxFloatingLoss)}</strong>
        </article>
      </div>
      <div className="pressure-block">
        <div className="pressure-row">
          <span>浮亏压力</span>
          <strong>{pressurePercent.toFixed(0)}%</strong>
        </div>
        <div className="pressure-track">
          <span style={{ width: `${pressurePercent}%` }} />
        </div>
        <p>
          最差低点：{position.worstLowDate ?? "-"}
          {position.worstLowPrice ? ` / ${formatNumber(position.worstLowPrice)}` : ""}
        </p>
      </div>
      <div className="pain-curve" aria-label="持仓期间每日低点盈亏曲线">
        {position.lowPnlCurve.length ? (
          position.lowPnlCurve.map((point) => (
            <span
              className={point.pnl >= 0 ? "positive-bar" : "negative-bar"}
              key={point.date}
              style={{ height: `${Math.max(8, Math.min(100, Math.abs(point.ratio) * 100))}%` }}
              title={`${point.date} ${formatNumber(point.pnl)}`}
            />
          ))
        ) : (
          <em>买入后会显示每日低点压力曲线</em>
        )}
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

function TradeReviewPanel({
  bars,
  reviews,
  sessionId,
  trades,
  onCreate,
}: {
  bars: KLineBar[];
  reviews: TradeReview[];
  sessionId: number | null;
  trades: TradeRecord[];
  onCreate: (review: TradeReview) => void;
}) {
  const selectableTrades = [...trades].sort((a, b) => a.index - b.index);
  const [startTradeId, setStartTradeId] = useState<string>("");
  const [endTradeId, setEndTradeId] = useState<string>("");
  const [title, setTitle] = useState("区间复盘");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");

  const metrics = useMemo(
    () => calculateReviewMetrics(selectableTrades, bars, parseNullableId(startTradeId), parseNullableId(endTradeId)),
    [selectableTrades, bars, startTradeId, endTradeId],
  );

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionId) {
      showInfo("请先选择标的并加载复盘 session 后再保存区间复盘。");
      return;
    }
    if (!title.trim()) {
      showError("请填写标题。");
      return;
    }

    try {
      const review = await createTradeReview(sessionId, {
        startTradeId: parseNullableId(startTradeId),
        endTradeId: parseNullableId(endTradeId),
        title: title.trim(),
        note,
        tags: tags
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        metricsSnapshot: metrics,
      });
      onCreate(review);
      setNote("");
      setTags("");
      showSuccess("已保存区间复盘。");
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  return (
    <section className="panel review-panel">
      <div className="section-header">
        <h2>区间复盘</h2>
        <span>{reviews.length}</span>
      </div>
      <form onSubmit={submitReview}>
        <div className="input-grid two-cols">
          <label>
            起点
            <select value={startTradeId} onChange={(event) => setStartTradeId(event.target.value)}>
              <option value="">自动</option>
              {selectableTrades.map((trade) => (
                <option key={trade.id} value={trade.id}>
                  {trade.date} {trade.side === "buy" ? "买入" : "卖出"}
                </option>
              ))}
            </select>
          </label>
          <label>
            终点
            <select value={endTradeId} onChange={(event) => setEndTradeId(event.target.value)}>
              <option value="">自动</option>
              {selectableTrades.map((trade) => (
                <option key={trade.id} value={trade.id}>
                  {trade.date} {trade.side === "buy" ? "买入" : "卖出"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="review-metrics">
          <article>
            <span>投入</span>
            <strong>{formatNumber(metrics.invested)}</strong>
          </article>
          <article>
            <span>收入</span>
            <strong>{formatNumber(metrics.proceeds)}</strong>
          </article>
          <article>
            <span>盈亏</span>
            <strong className={metrics.pnl >= 0 ? "positive" : "negative"}>{formatNumber(metrics.pnl)}</strong>
          </article>
          <article>
            <span>收益率</span>
            <strong className={metrics.pnlRate >= 0 ? "positive" : "negative"}>{formatPercent(metrics.pnlRate)}</strong>
          </article>
        </div>
        <label className="full-field">
          标题
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="full-field">
          标签
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="追高, 未按计划, 放量突破" />
        </label>
        <label className="full-field">
          总结笔记
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="总结这段交易的判断、执行和情绪问题" />
        </label>
        <button className="primary-button" type="submit">
          保存区间复盘
        </button>
      </form>

      <div className="review-list">
        {reviews.slice(0, 3).map((review) => (
          <article key={review.id}>
            <strong>{review.title}</strong>
            <span>{review.tags.join(" / ") || "未标记"}</span>
            <p>{review.note || "未填写总结"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function calculatePosition(trades: TradeRecord[], currentBar?: KLineBar, replayBars: KLineBar[] = []) {
  const lots: Array<{ quantity: number; unitCost: number; buyIndex: number }> = [];
  let realized = 0;

  for (const trade of [...trades].sort((a, b) => a.index - b.index)) {
    if (trade.side === "buy") {
      lots.push({
        quantity: trade.quantity,
        unitCost: (trade.price * trade.quantity + trade.fee) / trade.quantity,
        buyIndex: trade.index,
      });
    } else {
      let remaining = trade.quantity;
      let consumedCost = 0;
      for (const lot of lots) {
        if (remaining <= 0) break;
        if (lot.quantity <= 0) continue;
        const matched = Math.min(lot.quantity, remaining);
        consumedCost += matched * lot.unitCost;
        lot.quantity -= matched;
        remaining -= matched;
      }
      const soldQuantity = trade.quantity - remaining;
      realized += trade.price * soldQuantity - trade.fee - consumedCost;
    }
  }

  const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  const cost = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
  const avgCost = quantity > 0 ? cost / quantity : 0;
  const floating = currentBar && quantity > 0 ? (currentBar.close - avgCost) * quantity : 0;
  const floatingLow = currentBar && quantity > 0 ? (currentBar.low - avgCost) * quantity : 0;
  const openLots = lots.filter((lot) => lot.quantity > 0);
  const firstOpenIndex = openLots.length ? Math.min(...openLots.map((lot) => lot.buyIndex)) : -1;
  const holdingBars = firstOpenIndex >= 0 ? replayBars.slice(firstOpenIndex) : [];
  const worstBar = holdingBars.reduce<KLineBar | undefined>((worst, bar) => (!worst || bar.low < worst.low ? bar : worst), undefined);
  const maxFloatingLoss = worstBar && quantity > 0 ? (worstBar.low - avgCost) * quantity : 0;
  const lowPnlCurve = buildLowPnlCurve(holdingBars, avgCost, quantity);
  const pressurePercent = cost > 0 && maxFloatingLoss < 0 ? Math.min(100, (Math.abs(maxFloatingLoss) / cost) * 100) : 0;

  return {
    quantity,
    cost,
    avgCost,
    realized,
    floating,
    floatingLow,
    maxFloatingLoss,
    worstLowDate: worstBar?.date,
    worstLowPrice: worstBar?.low,
    pressurePercent,
    lowPnlCurve,
    total: realized + floatingLow,
  };
}

function calculateReviewMetrics(trades: TradeRecord[], bars: KLineBar[], startTradeId: number | null, endTradeId: number | null) {
  const sortedTrades = [...trades].sort((a, b) => a.index - b.index);
  if (!sortedTrades.length) {
    return { invested: 0, proceeds: 0, fee: 0, pnl: 0, pnlRate: 0, maxFloatingLoss: 0, startDate: null, endDate: null };
  }

  const startIndex = startTradeId ? Math.max(0, sortedTrades.findIndex((trade) => Number(trade.id) === startTradeId)) : 0;
  const fallbackEnd = sortedTrades.length - 1;
  const endIndex = endTradeId ? sortedTrades.findIndex((trade) => Number(trade.id) === endTradeId) : fallbackEnd;
  const selectedTrades = sortedTrades.slice(startIndex, Math.max(startIndex, endIndex) + 1);
  const invested = selectedTrades.filter((trade) => trade.side === "buy").reduce((sum, trade) => sum + trade.price * trade.quantity + trade.fee, 0);
  const proceeds = selectedTrades.filter((trade) => trade.side === "sell").reduce((sum, trade) => sum + trade.price * trade.quantity - trade.fee, 0);
  const fee = selectedTrades.reduce((sum, trade) => sum + trade.fee, 0);
  const pnl = proceeds - invested;
  const pnlRate = invested > 0 ? (pnl / invested) * 100 : 0;
  const startTrade = selectedTrades[0];
  const endTrade = selectedTrades[selectedTrades.length - 1];
  const rangeBars = bars.slice(startTrade?.index ?? 0, (endTrade?.index ?? 0) + 1);
  const avgBuyCost = selectedTrades
    .filter((trade) => trade.side === "buy")
    .reduce((sum, trade) => sum + trade.price * trade.quantity + trade.fee, 0);
  const buyQuantity = selectedTrades.filter((trade) => trade.side === "buy").reduce((sum, trade) => sum + trade.quantity, 0);
  const avgCost = buyQuantity > 0 ? avgBuyCost / buyQuantity : 0;
  const maxFloatingLoss = avgCost > 0 && buyQuantity > 0 ? Math.min(0, ...rangeBars.map((bar) => (bar.low - avgCost) * buyQuantity)) : 0;

  return {
    invested,
    proceeds,
    fee,
    pnl,
    pnlRate,
    maxFloatingLoss,
    startDate: startTrade?.date ?? null,
    endDate: endTrade?.date ?? null,
  };
}

function parseNullableId(value: string) {
  return value ? Number(value) : null;
}

function formatPercent(value: number) {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function buildLowPnlCurve(bars: KLineBar[], avgCost: number, quantity: number) {
  if (!bars.length || quantity <= 0 || avgCost <= 0) return [];

  const points = bars.map((bar) => ({
    date: bar.date,
    pnl: (bar.low - avgCost) * quantity,
  }));
  const maxAbs = Math.max(...points.map((point) => Math.abs(point.pnl)), 1);
  return points.slice(-48).map((point) => ({
    ...point,
    ratio: point.pnl / maxAbs,
  }));
}

function findBarIndexByDate(bars: KLineBar[], date: string) {
  if (!bars.length) return 0;
  const exactIndex = bars.findIndex((bar) => bar.date === date);
  if (exactIndex >= 0) return exactIndex;

  const nextIndex = bars.findIndex((bar) => bar.date > date);
  if (nextIndex < 0) return bars.length - 1;
  return Math.max(0, nextIndex - 1);
}
