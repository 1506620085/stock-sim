/**
 * TagSelect
 * 多标签选择：输入框内 Chip、下拉历史候选、Enter 创建、历史项可删；交互接近 Ant Design Select mode="multiple"。
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type TagSelectOption = {
  label: string;
  value: string;
};

type TagSelectProps = {
  mode?: "multiple";
  value?: string[];
  options?: Array<string | TagSelectOption>;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  onChange?: (value: string[]) => void;
  /** 历史候选变更（如下拉中删除某条历史） */
  onOptionsChange?: (options: string[]) => void;
};

const dropdownGap = 4;
const dropdownMaxHeight = 280;
const dropdownZIndex = 1200;

function normalizeOption(option: string | TagSelectOption): TagSelectOption {
  if (typeof option === "string") {
    const text = option.trim();
    return { label: text, value: text };
  }
  const value = String(option.value ?? "").trim();
  const label = String(option.label ?? value).trim() || value;
  return { label, value };
}

function normalizeTag(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

function uniquePreserveOrder(items: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const tag = normalizeTag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    next.push(tag);
  }
  return next;
}

export function TagSelect({
  mode = "multiple",
  value,
  options = [],
  placeholder = "请输入或选择标签",
  allowClear = false,
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
  onChange,
  onOptionsChange,
}: TagSelectProps) {
  void mode;
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const [openUpward, setOpenUpward] = useState(false);

  const selected = useMemo(() => uniquePreserveOrder(value ?? []), [value]);
  const historyOptions = useMemo(
    () => uniquePreserveOrder(options.map((item) => normalizeOption(item).value)),
    [options],
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function emitChange(next: string[]) {
    onChange?.(uniquePreserveOrder(next));
  }

  function emitOptionsChange(next: string[]) {
    onOptionsChange?.(uniquePreserveOrder(next));
  }

  function close() {
    setOpen(false);
    setDraft("");
  }

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
    setMounted(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function updateDropdownPosition() {
    const trigger = selectorRef.current;
    const dropdown = dropdownRef.current;
    if (!trigger || !dropdown) return;

    const rect = trigger.getBoundingClientRect();
    const dropdownHeight = Math.min(dropdown.scrollHeight, dropdownMaxHeight);
    const spaceBelow = window.innerHeight - rect.bottom - dropdownGap;
    const spaceAbove = rect.top - dropdownGap;
    const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    setOpenUpward(shouldOpenUpward);
    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      top: shouldOpenUpward ? rect.top - dropdownGap - dropdownHeight : rect.bottom + dropdownGap,
      width: Math.max(rect.width, 220),
      zIndex: dropdownZIndex,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateDropdownPosition();
  }, [open, historyOptions.length, selected.length, draft]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      close();
    };

    const handleWindowChange = () => updateDropdownPosition();

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    inputRef.current?.focus();

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag || selectedSet.has(tag)) {
      setDraft("");
      return;
    }
    emitChange([...selected, tag]);
    setDraft("");
  }

  function removeSelectedTag(tag: string, event?: ReactMouseEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    emitChange(selected.filter((item) => item !== tag));
    inputRef.current?.focus();
  }

  function clearAll(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    emitChange([]);
    setDraft("");
    inputRef.current?.focus();
  }

  function selectHistoryTag(tag: string) {
    if (selectedSet.has(tag)) return;
    addTag(tag);
    inputRef.current?.focus();
  }

  function removeHistoryTag(tag: string, event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    emitOptionsChange(historyOptions.filter((item) => item !== tag));
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (draft.trim()) {
        addTag(draft);
      }
      return;
    }

    if (event.key === "Backspace" && !draft && selected.length) {
      event.preventDefault();
      emitChange(selected.slice(0, -1));
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      openDropdown();
    }
  }

  function handleSelectorMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (disabled) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    event.preventDefault();
    if (!open) openDropdown();
    else inputRef.current?.focus();
  }

  const showPlaceholder = selected.length === 0 && !draft;

  return (
    <div className={["tag-select", className].filter(Boolean).join(" ")} ref={rootRef}>
      <div
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`tag-select-selector${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`}
        id={id}
        onMouseDown={handleSelectorMouseDown}
        ref={selectorRef}
      >
        <div className="tag-select-selection">
          {selected.map((tag) => (
            <span className="tag-select-chip" key={tag}>
              <em>{tag}</em>
              <button
                aria-label={`移除标签 ${tag}`}
                className="tag-select-chip-remove"
                disabled={disabled}
                onMouseDown={(event) => removeSelectedTag(tag, event)}
                type="button"
              >
                <X size={12} strokeWidth={2.25} />
              </button>
            </span>
          ))}
          <input
            aria-autocomplete="list"
            aria-controls={open ? listboxId : undefined}
            autoComplete="off"
            className="tag-select-input"
            disabled={disabled}
            onChange={(event) => {
              setDraft(event.target.value);
              if (!open) openDropdown();
            }}
            onFocus={() => {
              if (!open) openDropdown();
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={showPlaceholder ? placeholder : ""}
            ref={inputRef}
            value={draft}
          />
        </div>
        {allowClear && selected.length > 0 && !disabled ? (
          <button
            aria-label="清空全部标签"
            className="tag-select-clear"
            onMouseDown={clearAll}
            type="button"
          >
            <X size={14} strokeWidth={2.25} />
          </button>
        ) : null}
      </div>

      {mounted
        ? createPortal(
            <div
              className={`tag-select-dropdown${open ? " is-open" : ""}${openUpward ? " is-upward" : ""}`}
              id={listboxId}
              ref={dropdownRef}
              role="listbox"
              style={dropdownStyle}
            >
              <div className="tag-select-dropdown-header">历史标签</div>
              {historyOptions.length ? (
                <div className="tag-select-dropdown-list">
                  {historyOptions.map((tag) => {
                    const selectedAlready = selectedSet.has(tag);
                    return (
                      <div
                        aria-disabled={selectedAlready}
                        aria-selected={selectedAlready}
                        className={`tag-select-option${selectedAlready ? " is-selected" : ""}`}
                        key={tag}
                        role="option"
                      >
                        <button
                          className="tag-select-option-main"
                          disabled={selectedAlready || disabled}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selectHistoryTag(tag);
                          }}
                          type="button"
                        >
                          <span>{tag}</span>
                          {selectedAlready ? <em>已选</em> : null}
                        </button>
                        <button
                          aria-label={`删除历史标签 ${tag}`}
                          className="tag-select-option-remove"
                          disabled={disabled}
                          onMouseDown={(event) => removeHistoryTag(tag, event)}
                          type="button"
                        >
                          <X size={13} strokeWidth={2.25} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="tag-select-dropdown-empty">暂无历史标签，保存区间复盘后会出现在这里</p>
              )}
              <div className="tag-select-dropdown-footer">输入文字后按 Enter 创建标签</div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
