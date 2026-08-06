import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, Plus, Pencil, Trash2 } from "lucide-react";
import type { ReplaySession } from "./types";
import { formatSessionUpdatedAt } from "./sessionSelection";

type Props = {
  sessions: ReplaySession[];
  activeSessionId: number | null;
  disabled?: boolean;
  creating?: boolean;
  onSelect: (sessionId: number) => void;
  onCreate: () => void;
  onRename: (session: ReplaySession) => void;
  onDelete: (session: ReplaySession) => void;
};

export function ReplaySessionSwitcher({
  sessions,
  activeSessionId,
  disabled = false,
  creating = false,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = sessions.find((item) => item.id === activeSessionId) ?? sessions[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="replay-session-switcher" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="replay-session-switcher-trigger"
        disabled={disabled || !active}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="replay-session-switcher-copy">
          <strong>{active?.name ?? "暂无复盘会话"}</strong>
        </span>
        <ChevronsUpDown size={16} strokeWidth={2} />
      </button>

      {open ? (
        <div className="replay-session-switcher-menu" role="listbox">
          <div className="replay-session-switcher-menu-header">
            <span>复盘会话（{sessions.length}）</span>
            <button
              className="text-button"
              disabled={disabled || creating}
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              type="button"
            >
              <Plus size={15} />
              新建复盘
            </button>
          </div>
          <div className="replay-session-switcher-list">
            {sessions.length ? (
              sessions.map((session) => {
                const selected = session.id === active?.id;
                return (
                  <div className={`replay-session-switcher-item${selected ? " is-active" : ""}`} key={session.id}>
                    <button
                      className="replay-session-switcher-item-main"
                      onClick={() => {
                        onSelect(session.id);
                        setOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      <strong>{session.name}</strong>
                      <em>
                        #{session.id}
                        {session.updatedAt ? ` · ${formatSessionUpdatedAt(session.updatedAt)}` : ""}
                        {` · 复盘日 ${session.currentDate}`}
                      </em>
                    </button>
                    <button
                      aria-label={`重命名 ${session.name}`}
                      className="replay-session-switcher-action"
                      onClick={() => {
                        setOpen(false);
                        onRename(session);
                      }}
                      type="button"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label={`删除 ${session.name}`}
                      className="replay-session-switcher-action is-danger"
                      onClick={() => {
                        setOpen(false);
                        onDelete(session);
                      }}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="replay-session-switcher-empty">还没有复盘会话，点击「新建复盘」开始。</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
