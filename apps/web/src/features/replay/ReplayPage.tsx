import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LocateFixed, CloudCog } from "lucide-react";
import { showError, showInfo, showSuccess } from "../../components/ToastProvider";
import { AppSelect } from "../../components/AppSelect";
import { AppNumberStepper } from "../../components/AppNumberStepper";
import { AppSwitch } from "../../components/AppSwitch";
import { createReplaySession, createSessionTrade, createTradeReview, loadInstrumentKlines, loadReplaySessions, loadSessionTrades, loadTradeReviews, loadWatchlist, syncInstrumentKlines, updateReplaySession } from "./api";
import { KLineChartPanel } from "./KLineChartPanel";
import { QuoteSummary } from "./QuoteSummary";
import { aggregateKlines, findBarIndexByDate, resolveChartReplayDate } from "./aggregateKlines";
import { ChartToolbar } from "./ChartToolbar";
import { defaultChartDisplaySettings } from "./chartDisplay";
import { REPLAY_PENDING_CODE_KEY } from "../watchlist/WatchlistPage";
import { loadInstruments, loadPreferences, loadFeeTemplates, loadFeePreferences, saveFeePreferences, resolveFeeTemplate, templateToFeeSettings, feeTemplateLabel, resolveBarPrice, replayPriceBasisLabel, toTradePriceRule, type FeeTemplate, type ReplayPriceBasis } from "../settings/api";
import { calculateTradeFee } from "../calculators/calculations";
import {
  calculateAvailableCash,
  calculateMaxBuyableShares,
  calculateTradeAmount,
  formatCurrency,
  formatShareCount,
  normalizeTradeQuantity,
  SHARES_PER_LOT,
} from "./tradeFunds";
import type { ChartDisplaySettings, Instrument, IndicatorSettings, KLineBar, KlinePeriod, ReplaySession, TradeRecord, TradeReview, TradeSide } from "./types";

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
  const [activeInstrument, setActiveInstrument] = useState<Instrument | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hideFuture, setHideFuture] = useState(true);
  const [indicators, setIndicators] = useState(defaultIndicators);
  const [tradeSide, setTradeSide] = useState<TradeSide>("buy");
  const [quantity, setQuantity] = useState(SHARES_PER_LOT * 10);
  const [fee, setFee] = useState(5);
  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([]);
  const [selectedFeeTemplateId, setSelectedFeeTemplateId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [tradeReviews, setTradeReviews] = useState<TradeReview[]>([]);
  const [bars, setBars] = useState<KLineBar[]>([]);
  const [replaySession, setReplaySession] = useState<ReplaySession | null>(null);
  const [jumpDate, setJumpDate] = useState("");
  const [loadingBars, setLoadingBars] = useState(false);
  const [syncingBars, setSyncingBars] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [viewScrollToken, setViewScrollToken] = useState(0);
  const [viewScrollDate, setViewScrollDate] = useState("");
  const [klinePeriod, setKlinePeriod] = useState<KlinePeriod>("day");
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [chartDisplay, setChartDisplay] = useState<ChartDisplaySettings>(defaultChartDisplaySettings);
  const [preferences] = useState(() => loadPreferences());
  const buyPriceBasis: ReplayPriceBasis = preferences.replayBuyPriceBasis;
  const sellPriceBasis: ReplayPriceBasis = preferences.replaySellPriceBasis;
  const activePriceBasis = tradeSide === "buy" ? buyPriceBasis : sellPriceBasis;
  const activeCode = activeInstrument?.code ?? "";
  const activeAdjustType = replaySession?.adjustType ?? preferences.adjustType;
  const activeAssetType = activeInstrument?.assetType ?? (activeInstrument?.type === "ETF" ? "etf" : "stock");
  const availableFeeTemplates = useMemo(
    () => feeTemplates.filter((template) => template.assetType === activeAssetType),
    [feeTemplates, activeAssetType],
  );
  const selectedFeeTemplate = useMemo(
    () =>
      resolveFeeTemplate(feeTemplates, activeAssetType, {
        sessionTemplateId: replaySession?.feeTemplateId ?? selectedFeeTemplateId,
        preferredTemplateId: selectedFeeTemplateId,
      }),
    [feeTemplates, activeAssetType, replaySession?.feeTemplateId, selectedFeeTemplateId],
  );

  useEffect(() => {
    let cancelled = false;
    loadFeeTemplates()
      .then((templates) => {
        if (!cancelled) setFeeTemplates(templates);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
        const pendingCode = sessionStorage.getItem(REPLAY_PENDING_CODE_KEY);
        if (pendingCode) {
          sessionStorage.removeItem(REPLAY_PENDING_CODE_KEY);
        }
        const initialCode = pendingCode && known[pendingCode] ? pendingCode : codes[0];
        if (initialCode && known[initialCode]) {
          setActiveInstrument(known[initialCode]);
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
        const defaultTemplate = resolveFeeTemplate(feeTemplates, activeInstrument.assetType ?? "stock");
        const createdSession = await createReplaySession({
          instrumentId,
          name: `${activeInstrument.code} ${activeInstrument.name} 复盘`,
          startDate,
          currentDate,
          hideFuture,
          adjustType: activeAdjustType,
          indicatorConfig: indicators,
          feeTemplateId: defaultTemplate?.id ?? null,
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
  }, [activeAdjustType, activeInstrument?.id, bars, feeTemplates]);

  function handleFeeTemplateChange(templateId: number) {
    setSelectedFeeTemplateId(templateId);
    if (replaySession) {
      syncReplaySession(replaySession.id, { feeTemplateId: templateId });
    }
  }

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
  const tradePrice = selectedBar ? resolveBarPrice(selectedBar, activePriceBasis) : 0;
  const visibleDailyBars = hideFuture ? bars.slice(0, normalizedIndex + 1) : bars;
  const chartBars = useMemo(() => aggregateKlines(visibleDailyBars, klinePeriod), [visibleDailyBars, klinePeriod]);
  const availableReplayDates = useMemo(() => bars.map((bar) => bar.date), [bars]);
  const chartReplayDate = useMemo(() => resolveChartReplayDate(chartBars, selectedBar?.date), [chartBars, selectedBar?.date]);
  const summaryBarIndex = useMemo(() => {
    if (!chartBars.length) return 0;
    if (hoveredBarIndex !== null) return hoveredBarIndex;
    const date = chartReplayDate ?? selectedBar?.date;
    return date ? findBarIndexByDate(chartBars, date) : chartBars.length - 1;
  }, [chartBars, chartReplayDate, hoveredBarIndex, selectedBar?.date]);
  const replayBars = bars.slice(0, normalizedIndex + 1);
  const activeTrades = trades.filter((trade) => trade.code === activeCode);
  const replayTrades = activeTrades.filter((trade) => !selectedBar || trade.date <= selectedBar.date);
  const visibleTrades = hideFuture ? replayTrades : activeTrades;
  const activeDataSource = activeInstrument?.source ?? (activeInstrument?.id ? "database" : "-");
  const configuredDataSource = preferences.dataSource === "akshare" ? "AKShare" : "Tushare Pro";

  const position = useMemo(() => calculatePosition(replayTrades, selectedBar, replayBars), [replayTrades, selectedBar, replayBars]);
  const availableCash = useMemo(() => calculateAvailableCash(replayTrades), [replayTrades]);
  const sellableQuantity = useMemo(() => normalizeTradeQuantity(position.quantity), [position.quantity]);
  const maxBuyableQuantity = useMemo(() => {
    if (!selectedFeeTemplate || tradePrice <= 0) return 0;
    return calculateMaxBuyableShares(availableCash, tradePrice, templateToFeeSettings(selectedFeeTemplate));
  }, [availableCash, selectedFeeTemplate, tradePrice]);
  const maxTradeQuantity = tradeSide === "buy" ? maxBuyableQuantity : sellableQuantity;

  useEffect(() => {
    if (quantity > maxTradeQuantity) {
      setQuantity(maxTradeQuantity);
    }
  }, [maxTradeQuantity, quantity]);

  useEffect(() => {
    setHoveredBarIndex(null);
  }, [chartReplayDate, chartBars, klinePeriod]);

  useEffect(() => {
    if (!replaySession || !feeTemplates.length) return;
    const resolved = resolveFeeTemplate(feeTemplates, activeAssetType, { sessionTemplateId: replaySession.feeTemplateId });
    if (resolved) {
      setSelectedFeeTemplateId(resolved.id);
    }
  }, [activeAssetType, feeTemplates, replaySession?.feeTemplateId, replaySession?.id]);

  useEffect(() => {
    if (!selectedFeeTemplate || quantity <= 0 || tradePrice <= 0) return;
    const settings = templateToFeeSettings(selectedFeeTemplate);
    setFee(Number(calculateTradeFee(tradeSide, tradePrice, quantity, settings).toFixed(2)));
  }, [quantity, selectedFeeTemplate, tradePrice, tradeSide]);

  function applyReplaySession(session: ReplaySession, sourceBars: KLineBar[]) {
    const index = findBarIndexByDate(sourceBars, session.currentDate);
    setReplaySession(session);
    setHideFuture(session.hideFuture);
    setIndicators({ ...defaultIndicators, ...session.indicatorConfig });
    setSelectedIndex(index);
    setJumpDate(sourceBars[index]?.date ?? session.currentDate);
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

  function scrollChartView(date: string) {
    setViewScrollDate(date);
    setViewScrollToken((token) => token + 1);
  }

  function focusReplayDate() {
    if (!selectedBar?.date) return;
    setRecenterToken((token) => token + 1);
  }

  function moveReplayDate(delta: number) {
    commitReplayDate(normalizedIndex + delta);
    setRecenterToken((token) => token + 1);
  }

  function updateKlinePeriod(period: KlinePeriod) {
    setKlinePeriod(period);
    setRecenterToken((token) => token + 1);
  }

  function updateChartDisplay<K extends keyof ChartDisplaySettings>(key: K, value: ChartDisplaySettings[K]) {
    setChartDisplay((current) => {
      const next = { ...current, [key]: value };
      if (key === "showVolume") {
        setIndicators((indicators) => {
          const updated = { ...indicators, showVolume: value as boolean };
          if (replaySession) {
            syncReplaySession(replaySession.id, { indicatorConfig: updated });
          }
          return updated;
        });
      }
      return next;
    });
  }

  function jumpToFirstDay() {
    if (!chartBars.length) return;
    scrollChartView(chartBars[0].date);
  }

  function jumpToLastDay() {
    if (!chartBars.length) return;
    scrollChartView(chartBars[chartBars.length - 1].date);
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
    setRecenterToken((token) => token + 1);
  }

  async function syncCurrentInstrument() {
    if (!activeInstrument?.id) {
      showInfo("请先从自选页选择标的，再同步 K 线。");
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
      if (!(error as { notified?: boolean })?.notified) {
        showError(error instanceof Error ? error.message : "K 线同步失败");
      }
    } finally {
      setSyncingBars(false);
    }
  }

  async function submitTrade(normalizedQuantity: number) {
    if (!selectedBar || !replaySession || !activeInstrument?.id) {
      showInfo("请先选择标的、同步 K 线并创建复盘 session 后再交易。");
      return;
    }

    if (normalizedQuantity <= 0) {
      showInfo("请输入大于 0 的股数。");
      return;
    }

    if (tradeSide === "buy" && normalizedQuantity > maxBuyableQuantity) {
      showInfo(`资金不足，最多可买 ${maxBuyableQuantity.toLocaleString("zh-CN")} 股。`);
      return;
    }

    if (tradeSide === "sell" && normalizedQuantity > sellableQuantity) {
      showInfo(`持仓不足，最多可卖 ${sellableQuantity.toLocaleString("zh-CN")} 股。`);
      return;
    }

    if (normalizedQuantity !== quantity) {
      setQuantity(normalizedQuantity);
    }

    try {
      const createdTrade = await createSessionTrade(replaySession.id, activeCode, {
        side: tradeSide,
        quantity: normalizedQuantity,
        fee,
        note,
        priceRule: toTradePriceRule(tradeSide, activePriceBasis),
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
        <TradeHistory trades={visibleTrades} />
        <TradeReviewPanel
          bars={bars}
          reviews={tradeReviews}
          sessionId={replaySession?.id ?? null}
          trades={activeTrades}
          onCreate={(review) => setTradeReviews((items) => [review, ...items])}
        />
      </aside>

      <section className="replay-center">
        <div className="panel chart-panel">
          {activeInstrument ? (
            <>
          <div className="chart-toolbar">
            <div>
              <p className="eyebrow">
                {activeInstrument.market} / {activeInstrument.type}
                （数据源：{activeDataSource}
                {` · 配置源：${configuredDataSource}`}
                {` · 复权：${adjustLabel(activeAdjustType)}`}
                {loadingBars ? " · 加载中" : ""}
                {syncingBars ? " · 同步中" : ""}
                {loadingSession ? " · 复盘状态同步中" : ""}
                {replaySession ? ` · Session #${replaySession.id}` : ""}）
              </p>
              <h2>
                {activeInstrument.code} {activeInstrument.name}
              </h2>
            </div>
            <div className="day-controls">
              <TooltipWrap placement="bottom" tip="从 AKShare 同步 K 线到数据库">
                <button className="text-button" disabled={syncingBars || loadingBars} onClick={() => void syncCurrentInstrument()} type="button" aria-label="同步 K 线">
                  <CloudCog size={18} className={syncingBars ? "spinning" : undefined} />
                </button>
              </TooltipWrap>
              <TooltipWrap placement="bottom" tip="将图表视口移到最早 K 线（不改变复盘日）">
                <button type="button" disabled={!chartBars.length} onClick={jumpToFirstDay} aria-label="最早一天">
                  <ChevronsLeft size={18} />
                </button>
              </TooltipWrap>
              <TooltipWrap placement="bottom" tip="复盘日向前一天">
                <button type="button" disabled={!bars.length || normalizedIndex === 0} onClick={() => moveReplayDate(-1)} aria-label="上一天">
                  <ChevronLeft size={18} />
                </button>
              </TooltipWrap>
              <TooltipWrap placement="bottom" tip="将图表视口定位到当前复盘日">
                <button type="button" onClick={focusReplayDate} aria-label="回到复盘日">
                  <LocateFixed size={18} />
                </button>
              </TooltipWrap>
              <TooltipWrap placement="bottom" tip="复盘日向后一天">
                <button type="button" disabled={!bars.length || normalizedIndex >= bars.length - 1} onClick={() => moveReplayDate(1)} aria-label="下一天">
                  <ChevronRight size={18} />
                </button>
              </TooltipWrap>
              <TooltipWrap placement="bottom" tip={hideFuture ? "将图表视口移到当前可见范围内最新 K 线（不改变复盘日）" : "将图表视口移到最新 K 线（不改变复盘日）"}>
                <button type="button" disabled={!chartBars.length} onClick={jumpToLastDay} aria-label="最新一天">
                  <ChevronsRight size={18} />
                </button>
              </TooltipWrap>
              <TooltipWrap placement="bottom" tip="仅显示复盘日及之前的 K 线，隐藏未来数据">
                <div className="switch hide-future-switch">
                  <AppSwitch
                    aria-label="隐藏未来"
                    checked={hideFuture}
                    checkedChildren="开启"
                    onChange={updateHideFuture}
                    unCheckedChildren="关闭"
                  />
                  <span>隐藏未来</span>
                </div>
              </TooltipWrap>
            </div>
          </div>

          <div className="chart-meta">
            <ChartToolbar
              availableDates={availableReplayDates}
              disabled={!bars.length}
              displaySettings={chartDisplay}
              indicators={indicators}
              klinePeriod={klinePeriod}
              onDisplaySettingsChange={updateChartDisplay}
              onIndicatorChange={updateIndicator}
              onPeriodChange={updateKlinePeriod}
              onReplayDateChange={setJumpDate}
              onReplayDateSubmit={jumpToDate}
              onResetIndicators={resetIndicators}
              replayDate={jumpDate}
            />
          </div>

          {!loadingBars && !syncingBars && chartBars.length ? (
            <div className="chart-quote-summary">
              <QuoteSummary barIndex={summaryBarIndex} bars={chartBars} />
            </div>
          ) : null}

          {loadingBars || syncingBars ? (
            <div className="panel empty-state chart-empty-state chart-loading-state">
              <p className="eyebrow">K 线</p>
              <h2>{syncingBars ? "正在同步行情" : "正在加载行情"}</h2>
              <p className="empty-copy">请稍候，数据将从 AKShare 写入数据库后显示。</p>
            </div>
          ) : bars.length ? (
            <KLineChartPanel
              bars={chartBars}
              chartDisplay={chartDisplay}
              code={activeCode}
              indicators={indicators}
              onHoveredBarIndexChange={setHoveredBarIndex}
              period={klinePeriod}
              painPoint={{ date: position.worstLowDate, price: position.worstLowPrice }}
              recenterToken={recenterToken}
              viewScrollDate={viewScrollDate}
              viewScrollToken={viewScrollToken}
              selectedDate={chartReplayDate}
              trades={visibleTrades}
            />
          ) : (
            <div className="panel empty-state chart-empty-state">
              <p className="eyebrow">K 线</p>
              <h2>暂无行情数据</h2>
              <p className="empty-copy">K 线需从 AKShare 同步到数据库后才会显示。请点击上方云同步按钮，或重新选择该标的触发自动同步。</p>
              <button className="primary-button" disabled={syncingBars} onClick={() => void syncCurrentInstrument()} type="button">
                <CloudCog size={16} className={syncingBars ? "spinning" : undefined} />
                同步 K 线
              </button>
            </div>
          )}
            </>
          ) : loadingWatchlist ? (
            <div className="panel empty-state chart-empty-state">
              <h2>正在加载自选</h2>
              <p className="empty-copy">请稍候...</p>
            </div>
          ) : (
            <div className="panel empty-state chart-empty-state">
              <h2>请选择自选标的</h2>
              <p className="empty-copy">请前往左侧「自选」页搜索并加入标的，点击「去复盘」即可在此开始 K 线复盘。</p>
            </div>
          )}
        </div>
      </section>

      <aside className="trade-column">
        <TradePanel
          availableCash={availableCash}
          feeTemplates={availableFeeTemplates}
          maxTradeQuantity={maxTradeQuantity}
          note={note}
          priceBasis={activePriceBasis}
          quantity={quantity}
          selectedBar={selectedBar}
          selectedFeeTemplate={selectedFeeTemplate}
          side={tradeSide}
          onFeeTemplateChange={handleFeeTemplateChange}
          onNoteChange={setNote}
          onQuantityChange={setQuantity}
          onSideChange={setTradeSide}
          onSubmit={submitTrade}
        />
        <PnlPanel position={position} />
      </aside>
    </section>
  );
}

function TooltipWrap({
  tip,
  children,
  placement = "top",
}: {
  tip: string;
  children: ReactNode;
  placement?: "top" | "bottom";
}) {
  return (
    <span className={["tooltip-wrap", placement === "bottom" ? "tooltip-wrap--bottom" : ""].filter(Boolean).join(" ")} data-tooltip={tip}>
      {children}
    </span>
  );
}

function TradePanel({
  availableCash,
  feeTemplates,
  maxTradeQuantity,
  note,
  priceBasis,
  quantity,
  selectedBar,
  selectedFeeTemplate,
  side,
  onFeeTemplateChange,
  onNoteChange,
  onQuantityChange,
  onSideChange,
  onSubmit,
}: {
  availableCash: number;
  feeTemplates: FeeTemplate[];
  maxTradeQuantity: number;
  note: string;
  priceBasis: ReplayPriceBasis;
  quantity: number;
  selectedBar?: KLineBar;
  selectedFeeTemplate: FeeTemplate | null;
  side: TradeSide;
  onFeeTemplateChange: (templateId: number) => void;
  onNoteChange: (value: string) => void;
  onQuantityChange: (value: number) => void;
  onSideChange: (value: TradeSide) => void;
  onSubmit: (quantity: number) => void;
}) {
  const [quantityDraft, setQuantityDraft] = useState(String(quantity));
  const price = selectedBar ? resolveBarPrice(selectedBar, priceBasis) : 0;
  const priceLabel = replayPriceBasisLabel(priceBasis);
  const draftNumber = Number(quantityDraft);
  const previewQuantity = Number.isFinite(draftNumber) ? normalizeTradeQuantity(draftNumber) : quantity;
  const cappedPreviewQuantity = Math.min(previewQuantity, maxTradeQuantity);
  const showAdjustHint = Number.isFinite(draftNumber) && draftNumber > 0 && draftNumber !== cappedPreviewQuantity;
  const feeSettings = selectedFeeTemplate ? templateToFeeSettings(selectedFeeTemplate) : null;
  const previewFee =
    feeSettings && cappedPreviewQuantity > 0 && price > 0
      ? Number(calculateTradeFee(side, price, cappedPreviewQuantity, feeSettings).toFixed(2))
      : 0;
  const previewAmount = calculateTradeAmount(side, price, cappedPreviewQuantity, previewFee);
  const tradableLabel = side === "buy" ? "可买" : "可卖";
  const amountToneClass = side === "buy" ? "positive" : "negative";
  const [feeTemplateOpen, setFeeTemplateOpen] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = Math.min(normalizeTradeQuantity(Number(quantityDraft)), maxTradeQuantity);
    onQuantityChange(normalized);
    onSubmit(normalized);
  }

  return (
    <form className="panel trade-panel" onSubmit={handleSubmit}>
      <div className="section-header">
        <h2>模拟交易</h2>
      </div>
      <div className="chart-period-tabs trade-side-tabs" role="tablist" aria-label="交易方向">
        <button
          aria-selected={side === "buy"}
          className={`chart-period-tab${side === "buy" ? " active" : ""}`}
          onClick={() => onSideChange("buy")}
          role="tab"
          type="button"
        >
          买入
        </button>
        <button
          aria-selected={side === "sell"}
          className={`chart-period-tab${side === "sell" ? " active" : ""}`}
          onClick={() => onSideChange("sell")}
          role="tab"
          type="button"
        >
          卖出
        </button>
      </div>
      <div className="quote-box">
        {side === "buy" ? "买入" : "卖出"}按当日{priceLabel}：<strong>{formatNumber(price)}</strong>
      </div>
      <div className="input-grid two-cols trade-qty-fund-grid">
        <div className="trade-qty-field">
          <AppNumberStepper
            decrementAriaLabel="减少 100 股"
            incrementAriaLabel="增加 100 股"
            inputMode="numeric"
            label="数量（股）"
            max={maxTradeQuantity > 0 ? maxTradeQuantity : 0}
            normalizeToStep
            onChange={(value) => onQuantityChange(value ?? 0)}
            onDraftChange={setQuantityDraft}
            step={SHARES_PER_LOT}
            value={quantity}
          />
          <span className="trade-lot-hint">
            {showAdjustHint ? `失焦后将调整为 ${cappedPreviewQuantity.toLocaleString("zh-CN")} 股` : null}
          </span>
        </div>
        <div className="trade-fund-field">
          <div aria-label="资金信息" className="trade-fund-info">
            <div className="trade-fund-row">
              <span className="trade-fund-label">资金：</span>
              <span className="trade-fund-value">{formatCurrency(availableCash)}</span>
            </div>
            <div className="trade-fund-row">
              <span className="trade-fund-label">{tradableLabel}：</span>
              <span className="trade-fund-value">{formatShareCount(maxTradeQuantity)}</span>
            </div>
            <div className="trade-fund-row">
              <span className="trade-fund-label">金额：</span>
              <span className={`trade-fund-value ${amountToneClass}`}>{formatCurrency(previewAmount)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="trade-fee-template-field">
        <button
          aria-expanded={feeTemplateOpen}
          className="trade-fee-template-toggle"
          onClick={() => setFeeTemplateOpen((open) => !open)}
          type="button"
        >
          <span>费率模板</span>
          <span aria-hidden="true" className="trade-fee-template-caret">
            {feeTemplateOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>
        {feeTemplateOpen ? (
          <AppSelect
            className="trade-fee-template-select"
            onChange={(value) => {
              onFeeTemplateChange(Number(value));
              setFeeTemplateOpen(false);
            }}
            options={feeTemplates.map((template) => ({
              label: feeTemplateLabel(template),
              value: template.id,
            }))}
            value={selectedFeeTemplate?.id ?? null}
          />
        ) : null}
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
  const [activeTradeId, setActiveTradeId] = useState<TradeRecord["id"] | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<TradeRecord["id"], HTMLElement>>(new Map());
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties>({});
  const [tailLeft, setTailLeft] = useState(28);
  const [openUpward, setOpenUpward] = useState(false);

  const orderedTrades = useMemo(() => [...trades].reverse(), [trades]);
  const activeTrade = orderedTrades.find((trade) => trade.id === activeTradeId) ?? null;

  function updateBubblePosition() {
    if (!activeTradeId) return;
    const row = rowRefs.current.get(activeTradeId);
    const bubble = bubbleRef.current;
    if (!row || !bubble) return;

    const rowRect = row.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const gap = 8;
    const bubbleWidth = Math.min(Math.max(rowRect.width, 240), 320);
    const spaceBelow = window.innerHeight - rowRect.bottom - gap;
    const shouldOpenUpward = spaceBelow < bubbleRect.height + 16 && rowRect.top > bubbleRect.height + gap;
    const left = Math.min(Math.max(12, rowRect.left), window.innerWidth - bubbleWidth - 12);
    const top = shouldOpenUpward ? rowRect.top - gap - bubbleRect.height : rowRect.bottom + gap;
    const tailCenter = rowRect.left + rowRect.width / 2 - left;

    setOpenUpward(shouldOpenUpward);
    setTailLeft(Math.min(Math.max(tailCenter, 22), bubbleWidth - 22));
    setBubbleStyle({
      position: "fixed",
      top,
      left,
      width: bubbleWidth,
      zIndex: 1100,
    });
  }

  useLayoutEffect(() => {
    if (!activeTradeId) return;
    updateBubblePosition();
    const frame = window.requestAnimationFrame(updateBubblePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [activeTradeId, activeTrade?.note]);

  useEffect(() => {
    if (activeTradeId === null) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (historyRef.current?.contains(target) || bubbleRef.current?.contains(target)) return;
      setActiveTradeId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveTradeId(null);
      }
    };

    const handleWindowChange = () => updateBubblePosition();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [activeTradeId]);

  function toggleTradeNote(tradeId: TradeRecord["id"]) {
    setActiveTradeId((current) => (current === tradeId ? null : tradeId));
  }

  const noteBubble =
    activeTrade &&
    createPortal(
      <div
        className={`trade-note-bubble floating${openUpward ? " upward" : ""}`}
        ref={bubbleRef}
        role="note"
        style={{ ...bubbleStyle, ["--tail-left" as string]: `${tailLeft}px` }}
      >
        <p className="trade-note-bubble-title">
          {activeTrade.side === "buy" ? "买入笔记" : "卖出笔记"} · {activeTrade.date}
        </p>
        <p className="trade-note-bubble-body">{activeTrade.note || "未填写笔记"}</p>
      </div>,
      document.body,
    );

  return (
    <section className="panel trade-history-panel">
      <div className="section-header">
        <h2>交易记录</h2>
        <span>{trades.length}</span>
      </div>
      <div className="trade-history" ref={historyRef}>
        {trades.length ? (
          orderedTrades.map((trade) => {
            const active = activeTradeId === trade.id;
            return (
              <article
                aria-expanded={active}
                className={`trade-row ${trade.side}${active ? " active" : ""}`}
                key={trade.id}
                onClick={() => toggleTradeNote(trade.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleTradeNote(trade.id);
                  }
                }}
                ref={(node) => {
                  if (node) rowRefs.current.set(trade.id, node);
                  else rowRefs.current.delete(trade.id);
                }}
                role="button"
                tabIndex={0}
                title="点击查看交易笔记"
              >
                <div className="trade-row-main">
                  <strong>
                    {trade.side === "buy" ? "买入" : "卖出"} {trade.date}
                  </strong>
                  <span>
                    {formatNumber(trade.price)} / {trade.quantity.toLocaleString("zh-CN")} 份
                  </span>
                </div>
              </article>
            );
          })
        ) : (
          <p className="empty-copy">还没有交易记录。选择复盘日后记录买入或卖出。</p>
        )}
      </div>
      {noteBubble}
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
            <AppSelect
              onChange={setStartTradeId}
              options={[
                { label: "自动", value: "" },
                ...selectableTrades.map((trade) => ({
                  label: `${trade.date} ${trade.side === "buy" ? "买入" : "卖出"}`,
                  value: String(trade.id),
                })),
              ]}
              value={startTradeId}
            />
          </label>
          <label>
            终点
            <AppSelect
              onChange={setEndTradeId}
              options={[
                { label: "自动", value: "" },
                ...selectableTrades.map((trade) => ({
                  label: `${trade.date} ${trade.side === "buy" ? "买入" : "卖出"}`,
                  value: String(trade.id),
                })),
              ]}
              value={endTradeId}
            />
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
