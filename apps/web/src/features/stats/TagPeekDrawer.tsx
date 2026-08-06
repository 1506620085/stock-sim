import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronUp, Search } from "lucide-react";
import type { AggregatedTagStat } from "./tagAggregation";
import { formatTagDate, fuzzyMatchTag } from "./tagAggregation";

type Props = {
  items: AggregatedTagStat[];
  open: boolean;
  activeTag?: string | null;
  onOpenChange: (open: boolean) => void;
  onSelectTag: (tag: string) => void;
};

const PEEK_HEIGHT = 52;
const EXPANDED_RATIO = 0.62;

export function TagPeekDrawer({ items, open, activeTag, onOpenChange, onSelectTag }: Props) {
  const [query, setQuery] = useState("");
  const [dragOffset, setDragOffset] = useState(0);
  const dragRef = useRef<{ startY: number; open: boolean } | null>(null);

  const filtered = useMemo(() => {
    return items.filter((item) => fuzzyMatchTag(item.tag, query));
  }, [items, query]);

  function onHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, open };
    setDragOffset(0);
  }

  function onHandlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    setDragOffset(dragRef.current.startY - event.clientY);
  }

  function onHandlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    const delta = dragRef.current.startY - event.clientY;
    const wasOpen = dragRef.current.open;
    dragRef.current = null;
    setDragOffset(0);

    if (Math.abs(delta) < 12) {
      onOpenChange(!wasOpen);
      return;
    }
    onOpenChange(delta > 0);
  }

  const sheetStyle = open
    ? {
        height: `calc(${EXPANDED_RATIO * 100}% + ${Math.max(-40, Math.min(40, dragOffset))}px)`,
      }
    : {
        height: `${Math.max(PEEK_HEIGHT, Math.min(PEEK_HEIGHT + 80, PEEK_HEIGHT + dragOffset))}px`,
      };

  return (
    <>
      <button
        aria-hidden={!open}
        className={`tag-peek-mask${open ? " is-open" : ""}`}
        onClick={() => onOpenChange(false)}
        tabIndex={open ? 0 : -1}
        type="button"
      />

      <div aria-expanded={open} className={`tag-peek-drawer${open ? " is-open" : ""}`} style={sheetStyle}>
        <button
          aria-label={open ? "收起错因标签列表" : "展开错因标签列表"}
          className="tag-peek-handle"
          onPointerCancel={() => {
            dragRef.current = null;
            setDragOffset(0);
          }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          type="button"
        >
          <span className="tag-peek-grip" />
          <strong>标签列表</strong>
          <ChevronUp className="tag-peek-chevron" size={16} strokeWidth={2.2} />
          <em>{items.length}</em>
        </button>

        <div className="tag-peek-body">
          <div className="tag-peek-toolbar">
            <label className="tag-peek-search">
              <Search size={14} strokeWidth={2} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="模糊搜索错因标签"
                type="search"
                value={query}
              />
            </label>
          </div>

          <div className="tag-peek-tag-list" role="list">
            {filtered.length ? (
              filtered.map((item) => (
                <button
                  className={`tag-peek-tag-item${activeTag === item.tag ? " is-active" : ""}`}
                  key={item.tag}
                  onClick={() => onSelectTag(item.tag)}
                  role="listitem"
                  type="button"
                >
                  <span className="tag-peek-swatch" style={{ background: item.color }} />
                  <span className="tag-peek-tag-main">
                    <strong>{item.tag}</strong>
                    <em>
                      {item.count} 次 · {item.share.toFixed(1)}% · 最近 {formatTagDate(item.lastSeen)}
                    </em>
                  </span>
                </button>
              ))
            ) : (
              <p className="tag-peek-empty-copy">没有匹配的错因标签</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
