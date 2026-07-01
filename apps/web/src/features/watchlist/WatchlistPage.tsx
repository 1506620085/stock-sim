import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, Star } from "lucide-react";
import { showError, showSuccess } from "../../components/ToastProvider";
import type { ApiError } from "../../api/client";
import { loadInstruments } from "../settings/api";
import { addWatchlistItem, createInstrument, loadWatchlist, searchInstruments } from "../replay/api";
import type { Instrument } from "../replay/types";

const REPLAY_PENDING_CODE_KEY = "replay-pending-code";

export function WatchlistPage() {
  const [query, setQuery] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [remoteResults, setRemoteResults] = useState<Instrument[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [knownInstruments, setKnownInstruments] = useState<Record<string, Instrument>>({});
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const searchRequestId = useRef(0);

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
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingWatchlist(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function submitSearch() {
    const keyword = query.trim();
    setSearchKeyword(keyword);
    if (!keyword) {
      setRemoteResults([]);
      return;
    }

    const requestId = ++searchRequestId.current;
    setLoadingSearch(true);
    try {
      const results = await searchInstruments(keyword);
      if (requestId === searchRequestId.current) {
        setRemoteResults(results);
      }
    } catch (error: unknown) {
      if (requestId === searchRequestId.current) {
        setRemoteResults([]);
        const apiError = error as ApiError;
        if (!apiError?.notified) showError(error instanceof Error ? error.message : "搜索失败");
      }
    } finally {
      if (requestId === searchRequestId.current) {
        setLoadingSearch(false);
      }
    }
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
      showSuccess("已加入自选");
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  function openInReplay(code: string) {
    sessionStorage.setItem(REPLAY_PENDING_CODE_KEY, code);
    window.history.pushState({}, "", "/replay");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <section className="watchlist-page">
      <div className="watchlist-layout">
        <section className="panel">
          <label className="field-label" htmlFor="watchlistSearch">
            搜索股票 / ETF
          </label>
          <form
            className="search-row"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void submitSearch();
            }}
          >
            <input id="watchlistSearch" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入 6 位代码" />
            <button type="submit" aria-label="搜索" disabled={loadingSearch}>
              <Search size={16} />
            </button>
          </form>
          <div className="stock-list compact-list">
            {loadingSearch ? <p className="empty-copy">正在搜索行情...</p> : null}
            {!loadingSearch && searchKeyword && !remoteResults.length ? <p className="empty-copy">未找到匹配标的。</p> : null}
            {remoteResults.map((instrument) => (
              <button className="stock-row" key={`${instrument.source ?? "remote"}-${instrument.code}`} onClick={() => void addToWatchlist(instrument)} type="button">
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

        <section className="panel">
          <div className="section-header">
            <h2>
              <Star aria-hidden="true" size={18} />
              我的自选
            </h2>
            <span>{watchlist.length}</span>
          </div>
          <div className="stock-list">
            {loadingWatchlist ? <p className="empty-copy">正在加载自选...</p> : null}
            {!loadingWatchlist && !watchlist.length ? (
              <p className="empty-copy">还没有自选。搜索代码并点击结果加入，或前往复盘页添加。</p>
            ) : null}
            {watchlist.map((code) => {
              const instrument = knownInstruments[code];
              if (!instrument) return null;
              return (
                <button className="stock-row" key={code} onClick={() => openInReplay(code)} type="button">
                  <span>
                    <strong>
                      {instrument.code} {instrument.name}
                    </strong>
                    <small>
                      {instrument.market} / {instrument.type}
                    </small>
                  </span>
                  <em>去复盘</em>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

export { REPLAY_PENDING_CODE_KEY };
