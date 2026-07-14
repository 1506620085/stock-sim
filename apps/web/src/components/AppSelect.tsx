/**
 * AppSelect
 * 通用下拉选择组件：支持搜索、键盘操作与 Portal 浮层，用于表单与工具栏中的选项选择。
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
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type AppSelectOption<T extends string | number = string | number> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

type AppSelectProps<T extends string | number = string | number> = {
  value?: T | null;
  options: AppSelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
};

const dropdownGap = 4;
const dropdownMaxHeight = 256;
const dropdownZIndex = 1200;

function isSameValue(left: unknown, right: unknown) {
  return left === right || String(left) === String(right);
}

export function AppSelect<T extends string | number = string | number>({
  value,
  options,
  onChange,
  placeholder = "请选择",
  disabled = false,
  searchable,
  className,
  id,
  "aria-label": ariaLabel,
}: AppSelectProps<T>) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const [openUpward, setOpenUpward] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => isSameValue(option.value, value)),
    [options, value],
  );

  const enableSearch = searchable ?? options.length > 8;

  const filteredOptions = useMemo(() => {
    if (!enableSearch || !query.trim()) return options;
    const keyword = query.trim().toLowerCase();
    return options.filter((option) => String(option.label).toLowerCase().includes(keyword));
  }, [enableSearch, options, query]);

  const selectedIndex = filteredOptions.findIndex((option) => isSameValue(option.value, value));

  function close() {
    setOpen(false);
    setQuery("");
    setHighlightIndex(-1);
  }

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
    setMounted(true);
    setHighlightIndex(Math.max(0, selectedIndex));
  }

  function toggleDropdown() {
    if (open) {
      close();
      return;
    }
    openDropdown();
  }

  function selectOption(option: AppSelectOption<T>) {
    if (option.disabled) return;
    onChange(option.value);
    close();
    triggerRef.current?.focus();
  }

  function updateDropdownPosition() {
    const trigger = triggerRef.current;
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
      width: rect.width,
      zIndex: dropdownZIndex,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateDropdownPosition();
  }, [open, filteredOptions.length, query, enableSearch]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      close();
    };

    const handleWindowChange = () => updateDropdownPosition();

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    if (enableSearch) {
      searchRef.current?.focus();
    }

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open, enableSearch]);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openDropdown();
        return;
      }
      setHighlightIndex((current) => {
        const next = current < 0 ? 0 : Math.min(current + 1, filteredOptions.length - 1);
        return next;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openDropdown();
        return;
      }
      setHighlightIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function handleDropdownKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const option = filteredOptions[highlightIndex];
      if (option) selectOption(option);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    }
  }

  const dropdown = mounted
    ? createPortal(
        <div
          className={`app-select-dropdown${open ? " open" : ""}${openUpward ? " upward" : ""}`}
          onKeyDown={handleDropdownKeyDown}
          ref={dropdownRef}
          style={dropdownStyle}
        >
          {enableSearch ? (
            <div className="app-select-search">
              <input
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlightIndex(0);
                }}
                placeholder="搜索选项"
                ref={searchRef}
                type="search"
                value={query}
              />
            </div>
          ) : null}
          <ul aria-label={ariaLabel} className="app-select-list" id={listboxId} role="listbox">
            {filteredOptions.length ? (
              filteredOptions.map((option, index) => {
                const selected = isSameValue(option.value, value);
                const highlighted = index === highlightIndex;
                return (
                  <li key={String(option.value)} role="presentation">
                    <button
                      aria-selected={selected}
                      className={`app-select-option${selected ? " selected" : ""}${highlighted ? " highlighted" : ""}`}
                      disabled={option.disabled}
                      onClick={() => selectOption(option)}
                      onMouseEnter={() => setHighlightIndex(index)}
                      role="option"
                      type="button"
                    >
                      <span className="app-select-option-label">{option.label}</span>
                      {selected ? <Check aria-hidden="true" className="app-select-option-check" size={14} /> : null}
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="app-select-empty" role="presentation">
                无匹配选项
              </li>
            )}
          </ul>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={["app-select", className].filter(Boolean).join(" ")} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`app-select-trigger${open ? " open" : ""}${disabled ? " disabled" : ""}`}
        disabled={disabled}
        id={id}
        onClick={toggleDropdown}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className={`app-select-value${selectedOption ? "" : " placeholder"}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown aria-hidden="true" className="app-select-arrow" size={16} strokeWidth={2} />
      </button>
      {dropdown}
    </div>
  );
}
