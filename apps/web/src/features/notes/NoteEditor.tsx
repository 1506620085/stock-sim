import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { getMarkRange } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TextStyle } from "@tiptap/extension-text-style";
import FontSize from "@tiptap/extension-text-style/font-size";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Palette,
  Pencil,
  Quote,
  RefreshCw,
  RemoveFormatting,
  Strikethrough,
  Table2,
  CheckSquare,
  Unlink,
} from "lucide-react";
import { showError, showSuccess } from "../../components/ToastProvider";
import { DocumentTitle, isInDocumentTitle } from "./DocumentTitle";
import { displayTitle, extractTitleFromDoc, parseEditorContent } from "./treeUtils";

type NoteEditorProps = {
  noteId: number;
  content: string;
  /** 侧栏标题，用于无 H1 旧数据回填，以及侧栏重命名同步 */
  documentTitle?: string;
  saveState?: "idle" | "saving" | "saved";
  onChange: (json: string, title: string) => void;
  onManualSave?: (json: string, title: string) => void;
};

type BlockStyle = "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;

type AlignValue = "left" | "center" | "right" | "justify";

const DEFAULT_FONT_SIZE = 15;
const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48];
const LINK_COLOR = "#3C78E9";
const DEFAULT_LINK_TEXT = "链接";

type LinkModalState = {
  text: string;
  href: string;
  from: number;
  to: number;
  top: number;
  left: number;
};

type LinkHoverState = {
  text: string;
  href: string;
  from: number;
  to: number;
  top: number;
  left: number;
};

const ALIGN_OPTIONS: Array<{ value: AlignValue; label: string; shortcut: string; icon: typeof AlignLeft }> = [
  { value: "left", label: "左对齐", shortcut: "Shift Ctrl L", icon: AlignLeft },
  { value: "center", label: "居中对齐", shortcut: "Shift Ctrl C", icon: AlignCenter },
  { value: "right", label: "右对齐", shortcut: "Shift Ctrl R", icon: AlignRight },
  { value: "justify", label: "两端对齐", shortcut: "Shift Ctrl J", icon: AlignJustify },
];

const BLOCK_STYLE_OPTIONS: Array<{ value: BlockStyle; label: string; shortcut: string }> = [
  { value: "paragraph", label: "正文", shortcut: "Ctrl Alt 0" },
  { value: 1, label: "标题 1", shortcut: "Ctrl Alt 1" },
  { value: 2, label: "标题 2", shortcut: "Ctrl Alt 2" },
  { value: 3, label: "标题 3", shortcut: "Ctrl Alt 3" },
  { value: 4, label: "标题 4", shortcut: "Ctrl Alt 4" },
  { value: 5, label: "标题 5", shortcut: "Ctrl Alt 5" },
  { value: 6, label: "标题 6", shortcut: "Ctrl Alt 6" },
];

/** 工具栏默认色：字体红、背景黄 */
const DEFAULT_TEXT_COLOR = "#f53f3f";
const DEFAULT_BG_COLOR = "#fadc19";

/** 6 行 × 10 列色板：首格为清除，其余为可选色 */
const TEXT_COLORS = [
  "",
  "#1f2329",
  "#4e5969",
  "#86909c",
  "#c9cdd4",
  "#f53f3f",
  "#f77234",
  "#ff7d00",
  "#f7ba1e",
  "#fadc19",
  "#9fdb1d",
  "#00b42a",
  "#14c9c9",
  "#0fc6c2",
  "#3491fa",
  "#1664ff",
  "#722ed1",
  "#d91ad9",
  "#f5319d",
  "#eb2f96",
  "#5c0011",
  "#a8071a",
  "#cf1322",
  "#f5222d",
  "#ff4d4f",
  "#ff7875",
  "#ffa39e",
  "#ffccc7",
  "#fff1f0",
  "#fff2e8",
  "#613400",
  "#ad4e00",
  "#d46b08",
  "#fa8c16",
  "#ff9a2e",
  "#ffb65d",
  "#ffd591",
  "#ffe7ba",
  "#fff7e6",
  "#fcffe6",
  "#092b00",
  "#237804",
  "#389e0d",
  "#52c41a",
  "#73d13d",
  "#95de64",
  "#b7eb8f",
  "#d9f7be",
  "#f6ffed",
  "#e6fffb",
  "#002766",
  "#003a8c",
  "#0050b3",
  "#096dd9",
  "#1890ff",
  "#40a9ff",
  "#69c0ff",
  "#91d5ff",
  "#bae7ff",
  "#e6f7ff",
];

const BG_COLORS = [
  "",
  "#f7f8fa",
  "#f2f3f5",
  "#e5e6eb",
  "#c9cdd4",
  "#ffece8",
  "#ffd8bf",
  "#ffe7ba",
  "#fff7e8",
  "#fffce8",
  "#f5ffe8",
  "#e8ffea",
  "#e8fffb",
  "#e8f7ff",
  "#e8f3ff",
  "#f0e8ff",
  "#f5e8ff",
  "#ffe8f1",
  "#fff0f6",
  "#f9f0ff",
  "#ffa39e",
  "#ffbb96",
  "#ffd591",
  "#ffe58f",
  "#fffb8f",
  "#d3f261",
  "#b7eb8f",
  "#87e8de",
  "#91d5ff",
  "#adc6ff",
  "#ff7875",
  "#ff9c6e",
  "#ffc069",
  "#ffd666",
  "#fff566",
  "#bae637",
  "#95de64",
  "#5cdbd3",
  "#69c0ff",
  "#85a5ff",
  "#ff4d4f",
  "#ff7a45",
  "#ffa940",
  "#ffc53d",
  "#ffec3d",
  "#a0d911",
  "#73d13d",
  "#36cfc9",
  "#40a9ff",
  "#597ef7",
  "#f5222d",
  "#fa541c",
  "#fa8c16",
  "#faad14",
  "#fadb14",
  "#a0d911",
  "#52c41a",
  "#13c2c2",
  "#1890ff",
  "#2f54eb",
];

function formatShortcut(shortcut: string): string {
  return shortcut
    .split(" / ")
    .map((part) => {
      const trimmed = part.trim();
      if (trimmed.endsWith("++")) {
        return `${trimmed.slice(0, -2).split("+").join(" ")} +`;
      }
      return trimmed.split("+").join(" ");
    })
    .join(" / ");
}

function parseTipLabel(label: string): { tip: string; shortcut?: string } {
  const match = label.match(/^(.*?)（(.+)）$/);
  if (match) return { tip: match[1].trim(), shortcut: formatShortcut(match[2].trim()) };
  return { tip: label };
}

function KbTip({ label, children }: { label: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const { tip, shortcut } = parseTipLabel(label);

  function show() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(true), 40);
  }

  function hide() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span className="kb-tip" onBlur={hide} onFocus={show} onMouseDown={hide} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible ? (
        <span className="kb-tip-bubble" role="tooltip">
          <span className="kb-tip-title">{tip}</span>
          {shortcut ? <span className="kb-tip-keys">{shortcut}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <KbTip label={label}>
      <button
        aria-label={label}
        className={active ? "kb-toolbar-btn active" : "kb-toolbar-btn"}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    </KbTip>
  );
}

function getActiveBlockStyle(editor: Editor): BlockStyle {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive("heading", { level })) return level;
  }
  return "paragraph";
}

function applyBlockStyle(editor: Editor, style: BlockStyle) {
  // 首行标题固定为 H1，禁止降级或改成正文
  if (isInDocumentTitle(editor.state)) {
    if (style === 1) return;
    return;
  }
  if (style === "paragraph") {
    editor.chain().focus().setParagraph().run();
    return;
  }
  editor.chain().focus().setHeading({ level: style }).run();
}

function clearFormatting(editor: Editor) {
  if (isInDocumentTitle(editor.state)) {
    editor.chain().focus().unsetAllMarks().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
    return;
  }
  editor.chain().focus().clearNodes().unsetAllMarks().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
}

function syncTitleNode(editor: Editor, title: string) {
  const { state } = editor;
  const first = state.doc.firstChild;
  if (!first || first.type.name !== "heading") return;
  const next = title.trim();
  const current = first.textContent;
  if (current === next) return;

  const from = 1;
  const to = first.nodeSize - 1;
  const tr = state.tr;
  if (next) {
    tr.replaceWith(from, to, state.schema.text(next));
  } else if (to > from) {
    tr.delete(from, to);
  }
  editor.view.dispatch(tr);
}

function getCurrentFontSize(editor: Editor): number {
  const raw = editor.getAttributes("textStyle").fontSize as string | undefined;
  if (!raw) return DEFAULT_FONT_SIZE;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_FONT_SIZE;
}

function setFontSizePx(editor: Editor, size: number) {
  editor.chain().focus().setMark("textStyle", { fontSize: `${size}px` }).run();
}

function bumpFontSize(editor: Editor, direction: 1 | -1) {
  const current = getCurrentFontSize(editor);
  let index = FONT_SIZES.findIndex((size) => size === current);
  if (index < 0) {
    index = FONT_SIZES.findIndex((size) => size > current);
    if (index < 0) index = FONT_SIZES.length - 1;
    else if (direction < 0) index = Math.max(0, index - 1);
  } else {
    index = Math.min(FONT_SIZES.length - 1, Math.max(0, index + direction));
  }
  setFontSizePx(editor, FONT_SIZES[index]);
}

function getLinkModalPosition(editor: Editor, from: number, to: number) {
  const start = editor.view.coordsAtPos(from);
  const end = editor.view.coordsAtPos(to);
  return {
    top: Math.max(start.bottom, end.bottom) + 10,
    left: (start.left + end.left) / 2,
  };
}

function getLinkRangeAt(editor: Editor, pos: number): { from: number; to: number; href: string } | null {
  const linkType = editor.schema.marks.link;
  if (!linkType) return null;

  const { doc } = editor.state;
  const candidates = [pos, Math.min(pos + 1, doc.content.size), Math.max(pos - 1, 0)];

  for (const candidate of candidates) {
    const $pos = doc.resolve(candidate);
    const range = getMarkRange($pos, linkType);
    if (!range) continue;

    const mark = $pos.marks().find((item) => item.type === linkType)
      ?? doc.resolve(range.from).marks().find((item) => item.type === linkType);
    if (!mark) continue;

    return {
      from: range.from,
      to: range.to,
      href: (mark.attrs.href as string) || "",
    };
  }

  return null;
}

function buildLinkModalAt(editor: Editor, from: number, to: number): LinkModalState {
  const range = getLinkRangeAt(editor, from) ?? { from, to, href: "" };
  const text = editor.state.doc.textBetween(range.from, range.to, "\n");
  return {
    text,
    href: range.href,
    from: range.from,
    to: range.to,
    ...getLinkModalPosition(editor, range.from, range.to),
  };
}

function prepareLinkSelection(editor: Editor): Omit<LinkModalState, "top" | "left"> {
  const { from, to, empty } = editor.state.selection;
  const existingHref = (editor.getAttributes("link").href as string | undefined) || "";

  if (empty) {
    editor.chain().focus().insertContent(DEFAULT_LINK_TEXT).run();
    const end = editor.state.selection.from;
    const start = end - DEFAULT_LINK_TEXT.length;
    editor.chain().focus().setTextSelection({ from: start, to: end }).setColor(LINK_COLOR).run();
    return {
      text: DEFAULT_LINK_TEXT,
      href: existingHref,
      from: start,
      to: end,
    };
  }

  const selectedText = editor.state.doc.textBetween(from, to, "\n");
  editor.chain().focus().setTextSelection({ from, to }).setColor(LINK_COLOR).run();
  return {
    text: selectedText || DEFAULT_LINK_TEXT,
    href: existingHref,
    from,
    to,
  };
}

function applyLinkFromModal(editor: Editor, modal: LinkModalState) {
  const nextText = modal.text.trim() || DEFAULT_LINK_TEXT;
  const nextHref = modal.href.trim();
  const marks: Array<{ type: string; attrs?: Record<string, string> }> = [
    { type: "textStyle", attrs: { color: LINK_COLOR } },
  ];
  if (nextHref) {
    marks.push({ type: "link", attrs: { href: nextHref } });
  }

  editor
    .chain()
    .focus()
    .setTextSelection({ from: modal.from, to: modal.to })
    .insertContent({
      type: "text",
      text: nextText,
      marks,
    })
    .run();
}

function isMod(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey;
}

function BlockStyleSelect({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = getActiveBlockStyle(editor);
  const activeLabel = BLOCK_STYLE_OPTIONS.find((item) => item.value === active)?.label ?? "正文";

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const refresh = () => setTick((value) => value + 1);
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  return (
    <div className="kb-block-select" ref={rootRef}>
      <KbTip label="正文 / 标题">
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="正文与标题"
          className={open ? "kb-block-select-trigger active" : "kb-block-select-trigger"}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span>{activeLabel}</span>
          <ChevronDown size={12} />
        </button>
      </KbTip>
      {open ? (
        <div className="kb-block-menu" role="listbox">
          {BLOCK_STYLE_OPTIONS.map((item) => (
            <button
              aria-selected={active === item.value}
              className={active === item.value ? "kb-block-option active" : "kb-block-option"}
              key={String(item.value)}
              onClick={() => {
                applyBlockStyle(editor, item.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span className={`kb-block-option-label level-${item.value === "paragraph" ? "p" : item.value}`}>
                {item.label}
              </span>
              <span className="kb-block-option-shortcut">{item.shortcut}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FontSizeSelect({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentSize = getCurrentFontSize(editor);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const refresh = () => setTick((value) => value + 1);
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  return (
    <div className="kb-fontsize-select" ref={rootRef}>
      <KbTip label="字号调整（Alt Ctrl + / Alt Ctrl -）">
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="字号调整"
          className={open ? "kb-fontsize-trigger active" : "kb-fontsize-trigger"}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span>{currentSize} px</span>
          <ChevronDown size={12} />
        </button>
      </KbTip>
      {open ? (
        <div className="kb-fontsize-menu" role="listbox">
          {FONT_SIZES.map((size) => (
            <button
              aria-selected={currentSize === size}
              className={currentSize === size ? "kb-fontsize-option active" : "kb-fontsize-option"}
              key={size}
              onClick={() => {
                setFontSizePx(editor, size);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span style={{ fontSize: Math.min(size, 22) }}>{size}px</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColorPickerButton({
  editor,
  mode,
}: {
  editor: Editor;
  mode: "text" | "background";
}) {
  const defaultColor = mode === "text" ? DEFAULT_TEXT_COLOR : DEFAULT_BG_COLOR;
  const [open, setOpen] = useState(false);
  const [lastColor, setLastColor] = useState(defaultColor);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const colors = mode === "text" ? TEXT_COLORS : BG_COLORS;
  const current = (
    mode === "text"
      ? (editor.getAttributes("textStyle").color as string | undefined)
      : (editor.getAttributes("highlight").color as string | undefined)
  )?.toLowerCase() || "";
  const swatchColor = current || lastColor || defaultColor;

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function applyColor(value: string) {
    if (mode === "text") {
      if (!value) {
        editor.chain().focus().unsetColor().run();
      } else {
        setLastColor(value);
        editor.chain().focus().setColor(value).run();
      }
    } else if (!value) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      setLastColor(value);
      editor.chain().focus().setHighlight({ color: value }).run();
    }
    setOpen(false);
  }

  function applyDefaultColor() {
    applyColor(lastColor || defaultColor);
  }

  return (
    <div className="kb-color-picker" ref={rootRef}>
      <div className="kb-color-split">
        <KbTip label={mode === "text" ? "字体颜色（Alt Ctrl C）" : "背景颜色（Alt Ctrl H）"}>
          <button
            aria-label={mode === "text" ? "应用字体颜色" : "应用背景颜色"}
            className="kb-toolbar-btn kb-color-apply"
            onClick={applyDefaultColor}
            type="button"
          >
            {mode === "text" ? <Palette size={15} /> : <Highlighter size={15} />}
            <span
              className={mode === "text" ? "kb-color-swatch text" : "kb-color-swatch bg"}
              style={{ background: swatchColor }}
            />
          </button>
        </KbTip>
        <KbTip label="更多颜色">
          <button
            aria-expanded={open}
            aria-haspopup="true"
            aria-label={mode === "text" ? "选择字体颜色" : "选择背景颜色"}
            className={open ? "kb-toolbar-btn kb-color-caret active" : "kb-toolbar-btn kb-color-caret"}
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            <ChevronDown size={12} />
          </button>
        </KbTip>
      </div>
      {open ? (
        <div className="kb-color-menu" role="menu">
          <div className="kb-color-menu-title">{mode === "text" ? "字体颜色" : "背景颜色"}</div>
          <div className="kb-color-grid">
            {colors.map((value, index) => {
              const isClear = !value;
              const isSelected = isClear
                ? !current
                : current === value.toLowerCase() || (!current && value.toLowerCase() === lastColor.toLowerCase());
              return (
                <button
                  aria-label={isClear ? (mode === "text" ? "清除颜色" : "无背景") : value}
                  className={isSelected ? "kb-color-chip active" : "kb-color-chip"}
                  key={`${mode}-${index}-${value || "clear"}`}
                  onClick={() => applyColor(value)}
                  style={
                    value
                      ? { background: value }
                      : { background: "#fff", color: "#1f2329" }
                  }
                  title={isClear ? (mode === "text" ? "清除" : "无") : value}
                  type="button"
                >
                  {isClear ? "A" : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getActiveAlign(editor: Editor): AlignValue {
  for (const item of ALIGN_OPTIONS) {
    if (editor.isActive({ textAlign: item.value })) return item.value;
  }
  return "left";
}

function AlignSelect({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = getActiveAlign(editor);
  const activeOption = ALIGN_OPTIONS.find((item) => item.value === active);
  const ActiveIcon = activeOption?.icon ?? AlignLeft;

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const refresh = () => setTick((value) => value + 1);
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  return (
    <div className="kb-align-select" ref={rootRef}>
      <div className="kb-align-split">
        <KbTip label={`${activeOption?.label ?? "对齐"}（${activeOption?.shortcut ?? "Shift Ctrl L"}）`}>
          <button
            aria-label="应用对齐"
            className="kb-toolbar-btn kb-align-apply"
            onClick={() => editor.chain().focus().setTextAlign(active).run()}
            type="button"
          >
            <ActiveIcon size={15} />
          </button>
        </KbTip>
        <KbTip label="对齐方式">
          <button
            aria-expanded={open}
            aria-haspopup="true"
            aria-label="选择对齐方式"
            className={open ? "kb-toolbar-btn kb-align-caret active" : "kb-toolbar-btn kb-align-caret"}
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            <ChevronDown size={12} />
          </button>
        </KbTip>
      </div>
      {open ? (
        <div className="kb-align-menu" role="menu">
          {ALIGN_OPTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={active === item.value ? "kb-align-option active" : "kb-align-option"}
                key={item.value}
                onClick={() => {
                  editor.chain().focus().setTextAlign(item.value).run();
                  setOpen(false);
                }}
                type="button"
              >
                <span className="kb-align-option-main">
                  <Icon size={15} />
                  {item.label}
                </span>
                <span className="kb-align-option-shortcut">{item.shortcut}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function NoteEditor({ noteId, content, documentTitle = "", saveState = "idle", onChange, onManualSave }: NoteEditorProps) {
  const [linkModal, setLinkModal] = useState<LinkModalState | null>(null);
  const [linkHover, setLinkHover] = useState<LinkHoverState | null>(null);
  const linkUrlRef = useRef<HTMLInputElement | null>(null);
  const linkBubbleRef = useRef<HTMLDivElement | null>(null);
  const linkHoverTimerRef = useRef<number | null>(null);
  const hoveredAnchorRef = useRef<HTMLElement | null>(null);
  const linkModalRef = useRef<LinkModalState | null>(null);
  const openLinkModalRef = useRef<() => void>(() => undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  linkModalRef.current = linkModal;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      DocumentTitle,
      Placeholder.configure({
        showOnlyWhenEditable: true,
        showOnlyCurrent: false,
        emptyNodeClass: "is-empty",
        emptyEditorClass: "is-editor-empty",
        placeholder: ({ node, pos, editor }) => {
          if (node.type.name === "heading" && Number(node.attrs.level) === 1 && pos === 0) {
            return "请输入标题";
          }
          const title = editor.state.doc.firstChild;
          if (node.type.name === "paragraph" && title && pos === title.nodeSize) {
            return "开始写作，支持 Markdown 快捷输入…";
          }
          return "";
        },
      }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "kb-editor-link",
          style: "color: #3C78E9; text-decoration: none;",
        },
      }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: parseEditorContent(content, documentTitle),
    editorProps: {
      attributes: {
        class: "kb-editor-content",
      },
    },
    onUpdate: ({ editor: current }) => {
      const json = current.getJSON() as Record<string, unknown>;
      onChangeRef.current(JSON.stringify(json), displayTitle(extractTitleFromDoc(json)));
    },
  });

  function openLinkModal() {
    if (!editor) return;
    const prepared = prepareLinkSelection(editor);
    const position = getLinkModalPosition(editor, prepared.from, prepared.to);
    setLinkModal({ ...prepared, ...position });
  }

  openLinkModalRef.current = openLinkModal;

  useEffect(() => {
    if (!editor) return;
    const next = parseEditorContent(content, documentTitle);
    const current = JSON.stringify(editor.getJSON());
    if (current !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [noteId]);

  // 侧栏重命名时同步首行 H1（避免与输入过程互相抢写）
  useEffect(() => {
    if (!editor) return;
    const fromEditor = extractTitleFromDoc(editor.getJSON() as Record<string, unknown>);
    const next = documentTitle.trim();
    if (displayTitle(fromEditor) === displayTitle(next) || fromEditor === next) return;
    if (editor.view.hasFocus() && isInDocumentTitle(editor.state)) return;
    syncTitleNode(editor, next === "无标题笔记" ? "" : next);
  }, [documentTitle, editor]);

  useEffect(() => {
    if (!linkModal) return;
    hoveredAnchorRef.current?.classList.remove("kb-link-hover");
    hoveredAnchorRef.current = null;
    setLinkHover(null);
  }, [linkModal]);

  useEffect(() => {
    if (!linkModal) return;
    const timer = window.setTimeout(() => linkUrlRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [linkModal ? `${linkModal.from}-${linkModal.to}-${linkModal.top}-${linkModal.left}` : ""]);

  useEffect(() => {
    if (!editor) return;

    function clearHoverTimer() {
      if (linkHoverTimerRef.current) {
        window.clearTimeout(linkHoverTimerRef.current);
        linkHoverTimerRef.current = null;
      }
    }

    function setHoveredAnchor(anchor: HTMLElement | null) {
      if (hoveredAnchorRef.current && hoveredAnchorRef.current !== anchor) {
        hoveredAnchorRef.current.classList.remove("kb-link-hover");
      }
      hoveredAnchorRef.current = anchor;
      if (anchor) anchor.classList.add("kb-link-hover");
    }

    function hideLinkHover() {
      clearHoverTimer();
      setHoveredAnchor(null);
      setLinkHover(null);
    }

    function scheduleHideLinkHover() {
      clearHoverTimer();
      linkHoverTimerRef.current = window.setTimeout(() => {
        setHoveredAnchor(null);
        setLinkHover(null);
      }, 120);
    }

    function showLinkHover(event: MouseEvent) {
      if (linkModalRef.current) return;

      const target = event.target as HTMLElement;
      const anchor = target.closest("a.kb-editor-link");
      if (!anchor || !dom.contains(anchor)) return;

      const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!coords) return;

      const range = getLinkRangeAt(editor, coords.pos);
      if (!range) return;

      clearHoverTimer();
      setHoveredAnchor(anchor as HTMLElement);

      const text = editor.state.doc.textBetween(range.from, range.to, "\n");
      const position = getLinkModalPosition(editor, range.from, range.to);

      setLinkHover((current) => {
        if (
          current &&
          current.from === range.from &&
          current.to === range.to &&
          current.href === range.href &&
          current.text === text
        ) {
          return current;
        }
        return {
          from: range.from,
          to: range.to,
          href: range.href,
          text,
          ...position,
        };
      });
    }

    function onMouseOver(event: MouseEvent) {
      showLinkHover(event);
    }

    function onMouseOut(event: MouseEvent) {
      const related = event.relatedTarget as Node | null;
      const target = event.target as HTMLElement;
      const anchor = target.closest("a.kb-editor-link");
      if (!anchor) return;

      if (related && (anchor.contains(related) || linkBubbleRef.current?.contains(related))) {
        return;
      }

      scheduleHideLinkHover();
    }

    const dom = editor.view.dom;
    dom.addEventListener("mouseover", onMouseOver);
    dom.addEventListener("mouseout", onMouseOut);
    dom.addEventListener("scroll", hideLinkHover, true);

    return () => {
      dom.removeEventListener("mouseover", onMouseOver);
      dom.removeEventListener("mouseout", onMouseOut);
      dom.removeEventListener("scroll", hideLinkHover, true);
      clearHoverTimer();
      setHoveredAnchor(null);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    function onKeyDown(event: KeyboardEvent) {
      const mod = isMod(event);
      const { altKey, shiftKey, code } = event;
      if (!mod) return;

      // Ctrl+/ 清除格式
      if (!altKey && !shiftKey && (event.key === "/" || code === "Slash")) {
        event.preventDefault();
        clearFormatting(editor!);
        return;
      }

      // Ctrl+B 加粗
      if (!altKey && !shiftKey && code === "KeyB") {
        event.preventDefault();
        editor!.chain().focus().toggleBold().run();
        return;
      }

      // Ctrl+I 斜体
      if (!altKey && !shiftKey && code === "KeyI") {
        event.preventDefault();
        editor!.chain().focus().toggleItalic().run();
        return;
      }

      // Ctrl+U 下划线
      if (!altKey && !shiftKey && code === "KeyU") {
        event.preventDefault();
        editor!.chain().focus().toggleUnderline().run();
        return;
      }

      // Ctrl+E 代码块
      if (!altKey && !shiftKey && code === "KeyE") {
        event.preventDefault();
        editor!.chain().focus().toggleCodeBlock().run();
        return;
      }

      // Ctrl+K 插入链接
      if (!altKey && !shiftKey && code === "KeyK") {
        event.preventDefault();
        openLinkModalRef.current();
        return;
      }

      // Shift+Ctrl+X 删除线
      if (!altKey && shiftKey && code === "KeyX") {
        event.preventDefault();
        editor!.chain().focus().toggleStrike().run();
        return;
      }

      // Shift+Ctrl+U 引用
      if (!altKey && shiftKey && code === "KeyU") {
        event.preventDefault();
        editor!.chain().focus().toggleBlockquote().run();
        return;
      }

      // Shift+Ctrl+8 无序列表
      if (!altKey && shiftKey && code === "Digit8") {
        event.preventDefault();
        editor!.chain().focus().toggleBulletList().run();
        return;
      }

      // Shift+Ctrl+7 有序列表
      if (!altKey && shiftKey && code === "Digit7") {
        event.preventDefault();
        editor!.chain().focus().toggleOrderedList().run();
        return;
      }

      // Shift+Ctrl+L 左对齐
      if (!altKey && shiftKey && code === "KeyL") {
        event.preventDefault();
        editor!.chain().focus().setTextAlign("left").run();
        return;
      }

      // Shift+Ctrl+C 居中对齐
      if (!altKey && shiftKey && code === "KeyC") {
        event.preventDefault();
        editor!.chain().focus().setTextAlign("center").run();
        return;
      }

      // Shift+Ctrl+R 右对齐
      if (!altKey && shiftKey && code === "KeyR") {
        event.preventDefault();
        editor!.chain().focus().setTextAlign("right").run();
        return;
      }

      // Shift+Ctrl+J 两端对齐
      if (!altKey && shiftKey && code === "KeyJ") {
        event.preventDefault();
        editor!.chain().focus().setTextAlign("justify").run();
        return;
      }

      // Alt+Ctrl++ 增大字号 / Alt+Ctrl+- 减小字号
      if (
        altKey &&
        (code === "Equal" || code === "NumpadAdd" || event.key === "+" || event.key === "=")
      ) {
        event.preventDefault();
        bumpFontSize(editor!, 1);
        return;
      }
      if (
        altKey &&
        !shiftKey &&
        (code === "Minus" || code === "NumpadSubtract" || event.key === "-" || event.key === "_")
      ) {
        event.preventDefault();
        bumpFontSize(editor!, -1);
        return;
      }

      // Alt+Ctrl+C 字体颜色（默认红）
      if (altKey && !shiftKey && code === "KeyC") {
        event.preventDefault();
        editor!.chain().focus().setColor(DEFAULT_TEXT_COLOR).run();
        return;
      }

      // Alt+Ctrl+H 背景颜色（默认黄）
      if (altKey && !shiftKey && code === "KeyH") {
        event.preventDefault();
        editor!.chain().focus().setHighlight({ color: DEFAULT_BG_COLOR }).run();
        return;
      }

      // Alt+Ctrl+T 待办列表
      if (altKey && !shiftKey && code === "KeyT") {
        event.preventDefault();
        editor!.chain().focus().toggleTaskList().run();
        return;
      }

      // Alt+Ctrl+S 分割线
      if (altKey && !shiftKey && code === "KeyS") {
        event.preventDefault();
        editor!.chain().focus().setHorizontalRule().run();
        return;
      }

      // Alt+Ctrl+0~6 正文 / 标题
      if (altKey && !shiftKey) {
        if (event.key === "0" || code === "Digit0") {
          event.preventDefault();
          applyBlockStyle(editor!, "paragraph");
          return;
        }
        if (event.key >= "1" && event.key <= "6") {
          event.preventDefault();
          applyBlockStyle(editor!, Number(event.key) as 1 | 2 | 3 | 4 | 5 | 6);
        }
      }
    }

    const dom = editor.view.dom;
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  if (!editor) return null;

  function addImage() {
    const url = window.prompt("图片地址", "https://");
    if (!url?.trim() || !editor) return;
    editor.chain().focus().setImage({ src: url.trim() }).run();
  }

  function confirmLinkModal() {
    if (!linkModal) return;
    applyLinkFromModal(editor, linkModal);
    setLinkModal(null);
  }

  function handleManualSave() {
    if (!editor || !onManualSave || saveState === "saving") return;
    const json = editor.getJSON() as Record<string, unknown>;
    onManualSave(JSON.stringify(json), displayTitle(extractTitleFromDoc(json)));
  }

  function clearLinkHoverTimer() {
    if (linkHoverTimerRef.current) {
      window.clearTimeout(linkHoverTimerRef.current);
      linkHoverTimerRef.current = null;
    }
  }

  function scheduleHideLinkHover() {
    clearLinkHoverTimer();
    linkHoverTimerRef.current = window.setTimeout(() => {
      hoveredAnchorRef.current?.classList.remove("kb-link-hover");
      hoveredAnchorRef.current = null;
      setLinkHover(null);
    }, 120);
  }

  function visitHoveredLink() {
    if (!linkHover?.href) return;
    window.open(linkHover.href, "_blank", "noopener,noreferrer");
  }

  function editHoveredLink() {
    if (!editor || !linkHover) return;
    const modal = buildLinkModalAt(editor, linkHover.from, linkHover.to);
    hoveredAnchorRef.current?.classList.remove("kb-link-hover");
    hoveredAnchorRef.current = null;
    setLinkHover(null);
    setLinkModal(modal);
    editor.chain().focus().setTextSelection({ from: modal.from, to: modal.to }).run();
  }

  async function copyHoveredLinkText() {
    if (!linkHover?.text) return;
    try {
      await navigator.clipboard.writeText(linkHover.text);
      showSuccess("已复制链接文字");
    } catch {
      showError("复制失败");
    }
  }

  function unlinkHoveredLink() {
    if (!editor || !linkHover) return;
    const range = getLinkRangeAt(editor, linkHover.from) ?? linkHover;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: range.from, to: range.to })
      .extendMarkRange("link")
      .unsetLink()
      .unsetColor()
      .run();
    hoveredAnchorRef.current?.classList.remove("kb-link-hover");
    hoveredAnchorRef.current = null;
    setLinkHover(null);
  }

  return (
    <div className="kb-editor">
      <div className="kb-toolbar" role="toolbar" aria-label="编辑工具栏">
        <KbTip label="更新">
          <button
            aria-label="更新"
            className={`kb-toolbar-btn${saveState === "saving" ? " active" : ""}`}
            disabled={saveState === "saving"}
            onClick={handleManualSave}
            type="button"
          >
            <RefreshCw className={saveState === "saving" ? "kb-toolbar-spin" : undefined} size={15} />
          </button>
        </KbTip>
        <BlockStyleSelect editor={editor} />
        <FontSizeSelect editor={editor} />
        <span className="kb-toolbar-sep" />
        <ToolbarButton active={editor.isActive("bold")} label="加粗（Ctrl B）" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} label="斜体（Ctrl I）" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("underline")} label="下划线（Ctrl U）" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <span className="kb-toolbar-underline-icon">U</span>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("strike")} label="删除线（Shift Ctrl X）" onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("code")} label="行内代码" onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code2 size={15} />
        </ToolbarButton>
        <ColorPickerButton editor={editor} mode="text" />
        <ColorPickerButton editor={editor} mode="background" />
        <AlignSelect editor={editor} />
        <ToolbarButton label="清除格式（Ctrl /）" onClick={() => clearFormatting(editor)}>
          <RemoveFormatting size={15} />
        </ToolbarButton>
        <span className="kb-toolbar-sep" />
        <ToolbarButton active={editor.isActive("bulletList")} label="无序列表（Shift Ctrl 8）" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} label="有序列表（Shift Ctrl 7）" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("taskList")} label="待办列表（Alt Ctrl T）" onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <CheckSquare size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("blockquote")} label="引用（Shift Ctrl U）" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("codeBlock")} label="代码块（Ctrl E）" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 size={15} />
        </ToolbarButton>
        <span className="kb-toolbar-sep" />
        <ToolbarButton label="分割线（Alt Ctrl S）" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus size={15} />
        </ToolbarButton>
        <ToolbarButton label="链接（Ctrl K）" onClick={openLinkModal}>
          <Link2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="图片" onClick={addImage}>
          <ImageIcon size={15} />
        </ToolbarButton>
        <ToolbarButton label="表格" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table2 size={15} />
        </ToolbarButton>
        <span className="kb-toolbar-spacer" />
        <span className="kb-save-state" aria-live="polite">
          {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已自动保存" : ""}
        </span>
      </div>
      <div className="kb-editor-body">
        <EditorContent editor={editor} />
      </div>

      {linkHover && !linkModal ? (
        <div
          className="kb-link-bubble"
          onMouseEnter={clearLinkHoverTimer}
          onMouseLeave={scheduleHideLinkHover}
          ref={linkBubbleRef}
          role="toolbar"
          aria-label="链接操作"
          style={{ top: linkHover.top, left: linkHover.left }}
        >
          <KbTip label="访问链接">
            <button
              aria-label="访问链接"
              className="kb-link-bubble-btn"
              disabled={!linkHover.href}
              onClick={visitHoveredLink}
              type="button"
            >
              <ExternalLink size={15} />
            </button>
          </KbTip>
          <KbTip label="编辑">
            <button aria-label="编辑链接" className="kb-link-bubble-btn" onClick={editHoveredLink} type="button">
              <Pencil size={15} />
            </button>
          </KbTip>
          <KbTip label="复制">
            <button aria-label="复制链接文字" className="kb-link-bubble-btn" onClick={copyHoveredLinkText} type="button">
              <Copy size={15} />
            </button>
          </KbTip>
          <KbTip label="取消链接">
            <button aria-label="取消链接" className="kb-link-bubble-btn" onClick={unlinkHoveredLink} type="button">
              <Unlink size={15} />
            </button>
          </KbTip>
        </div>
      ) : null}

      {linkModal ? (
        <>
          <button aria-label="关闭链接编辑" className="kb-link-backdrop" onClick={() => setLinkModal(null)} type="button" />
          <div
            className="kb-link-modal"
            role="dialog"
            style={{ top: linkModal.top, left: linkModal.left }}
          >
            <label className="kb-link-field">
              <span>文本</span>
              <input
                onChange={(event) => setLinkModal((current) => (current ? { ...current, text: event.target.value } : current))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmLinkModal();
                  }
                  if (event.key === "Escape") setLinkModal(null);
                }}
                value={linkModal.text}
              />
            </label>
            <label className="kb-link-field">
              <span>链接</span>
              <input
                onChange={(event) => setLinkModal((current) => (current ? { ...current, href: event.target.value } : current))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmLinkModal();
                  }
                  if (event.key === "Escape") setLinkModal(null);
                }}
                placeholder="请输入链接"
                ref={linkUrlRef}
                value={linkModal.href}
              />
            </label>
            <div className="kb-link-actions">
              <button className="kb-link-confirm" onClick={confirmLinkModal} type="button">
                确定
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
