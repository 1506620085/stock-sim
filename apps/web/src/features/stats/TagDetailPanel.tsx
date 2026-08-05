import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { TagOccurrence } from "./tagAggregation";
import { formatTagDate, formatTagSource } from "./tagAggregation";

type Props = {
  items: TagOccurrence[];
  filterTag: string | null;
  open: boolean;
  onClearFilter: () => void;
  onCollapse: () => void;
  onExpand: () => void;
};

export function TagDetailPanel({ items, filterTag, open, onClearFilter, onCollapse, onExpand }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties>({});
  const [tailLeft, setTailLeft] = useState(28);
  const [openUpward, setOpenUpward] = useState(false);

  const activeItem = activeKey ? items.find((item, index) => occurrenceKey(item, index) === activeKey) ?? null : null;

  function updateBubblePosition() {
    if (!activeKey) return;
    const row = rowRefs.current.get(activeKey);
    const bubble = bubbleRef.current;
    if (!row || !bubble) return;

    const rowRect = row.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const gap = 8;
    const bubbleWidth = Math.min(Math.max(rowRect.width, 240), 360);
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
    if (!activeKey || !open) return;
    updateBubblePosition();
    const frame = window.requestAnimationFrame(updateBubblePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [activeKey, activeItem?.note, activeItem?.title, open]);

  useEffect(() => {
    if (activeKey === null || !open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (listRef.current?.contains(target) || bubbleRef.current?.contains(target)) return;
      setActiveKey(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveKey(null);
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
  }, [activeKey, open]);

  useEffect(() => {
    setActiveKey(null);
  }, [filterTag, items, open]);

  const noteBubble =
    open &&
    activeItem &&
    createPortal(
      <div
        className={`trade-note-bubble floating${openUpward ? " upward" : ""}`}
        ref={bubbleRef}
        role="note"
        style={{ ...bubbleStyle, ["--tail-left" as string]: `${tailLeft}px` }}
      >
        <p className="trade-note-bubble-title">
          总结笔记 · {activeItem.title?.trim() || activeItem.tag}
          {activeItem.created_at || activeItem.end_date || activeItem.start_date
            ? ` · ${formatTagDate(activeItem.created_at || activeItem.end_date || activeItem.start_date)}`
            : ""}
        </p>
        <p className="trade-note-bubble-body">{activeItem.note?.trim() || "未填写总结"}</p>
      </div>,
      document.body,
    );

  return (
    <aside
      aria-hidden={!open}
      aria-label="错因详情列表"
      className={`tag-detail-drawer${open ? " is-open" : ""}`}
    >
      <button
        aria-expanded={open}
        aria-label={open ? "收起错因详情列表" : "展开错因详情列表"}
        className="tag-detail-handle"
        onClick={() => (open ? onCollapse() : onExpand())}
        title={open ? "收起详情列表" : "展开详情列表"}
        type="button"
      >
        <span className="tag-detail-handle-label">详情列表</span>
        <span aria-hidden="true" className={`tag-detail-handle-arrow${open ? " is-open" : ""}`} />
      </button>

      <div className="tag-detail-panel">
        <div className="tag-detail-panel-header">
          <div className="tag-detail-panel-title">
            <strong>错因详情列表</strong>
            <span>
              {filterTag ? `筛选：${filterTag}` : "全部标签 · 按发布时间从新到旧"}
              {` · ${items.length}`}
            </span>
          </div>
          <div className="tag-detail-panel-actions">
            {filterTag ? (
              <button onClick={onClearFilter} type="button">
                <X size={14} />
                清除筛选
              </button>
            ) : null}
          </div>
        </div>

        <div className="tag-detail-panel-body">
          {items.length ? (
            <ul className="tag-detail-occurrence-list" ref={listRef}>
              {items.map((item, index) => {
                const key = occurrenceKey(item, index);
                const active = activeKey === key;
                return (
                  <li key={key}>
                    <button
                      aria-expanded={active}
                      className={`tag-detail-occurrence-button${active ? " is-active" : ""}`}
                      onClick={() => setActiveKey((current) => (current === key ? null : key))}
                      ref={(node) => {
                        if (node) rowRefs.current.set(key, node);
                        else rowRefs.current.delete(key);
                      }}
                      type="button"
                    >
                      <div className="tag-detail-occurrence-row">
                        <div className="tag-detail-occurrence-main">
                          <div className="tag-detail-occurrence-title">
                            <strong>{item.tag}</strong>
                            <span className="tag-detail-occurrence-source">{formatTagSource(item)}</span>
                          </div>
                          <span className="tag-detail-occurrence-time">
                            发布 {formatTagDate(item.created_at || item.end_date || item.start_date)}
                          </span>
                        </div>
                        <em className={item.pnl >= 0 ? "positive" : "negative"}>{formatSigned(item.pnl)}</em>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-copy">
              {filterTag ? "该标签暂无详情记录。" : "区间复盘添加标签后，这里会按时间展示详情。"}
            </p>
          )}
        </div>
      </div>
      {noteBubble}
    </aside>
  );
}

function occurrenceKey(item: TagOccurrence, index: number) {
  return `${item.review_id ?? "x"}-${item.tag}-${index}`;
}

function formatSigned(value: number) {
  const abs = Math.abs(value).toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}
