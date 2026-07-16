import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
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
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import {
  Bold,
  ChevronDown,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Strikethrough,
  Table2,
  CheckSquare,
} from "lucide-react";
import { parseEditorContent } from "./treeUtils";

type NoteEditorProps = {
  noteId: number;
  content: string;
  onChange: (json: string) => void;
};

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
    <button
      aria-label={label}
      className={active ? "kb-toolbar-btn active" : "kb-toolbar-btn"}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
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
        <button
          aria-label={mode === "text" ? "应用字体颜色" : "应用背景颜色"}
          className="kb-toolbar-btn kb-color-apply"
          onClick={applyDefaultColor}
          title={mode === "text" ? `字体颜色（默认红色）` : `背景颜色（默认黄色）`}
          type="button"
        >
          {mode === "text" ? <Palette size={15} /> : <Highlighter size={15} />}
          <span
            className={mode === "text" ? "kb-color-swatch text" : "kb-color-swatch bg"}
            style={{ background: swatchColor }}
          />
        </button>
        <button
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={mode === "text" ? "选择字体颜色" : "选择背景颜色"}
          className={open ? "kb-toolbar-btn kb-color-caret active" : "kb-toolbar-btn kb-color-caret"}
          onClick={() => setOpen((value) => !value)}
          title="更多颜色"
          type="button"
        >
          <ChevronDown size={12} />
        </button>
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

export function NoteEditor({ noteId, content, onChange }: NoteEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Placeholder.configure({ placeholder: "开始写作，支持 Markdown 快捷输入…" }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: parseEditorContent(content),
    editorProps: {
      attributes: {
        class: "kb-editor-content",
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(JSON.stringify(current.getJSON()));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = parseEditorContent(content);
    const current = JSON.stringify(editor.getJSON());
    if (current !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [noteId]);

  if (!editor) return null;

  function setLink() {
    const previous = editor?.getAttributes("link").href as string | undefined;
    const url = window.prompt("链接地址", previous ?? "https://");
    if (url === null || !editor) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function addImage() {
    const url = window.prompt("图片地址", "https://");
    if (!url?.trim() || !editor) return;
    editor.chain().focus().setImage({ src: url.trim() }).run();
  }

  return (
    <div className="kb-editor">
      <div className="kb-toolbar" role="toolbar" aria-label="编辑工具栏">
        <ToolbarButton active={editor.isActive("heading", { level: 1 })} label="标题 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 2 })} label="标题 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 3 })} label="标题 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={15} />
        </ToolbarButton>
        <span className="kb-toolbar-sep" />
        <ToolbarButton active={editor.isActive("bold")} label="加粗" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} label="斜体" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("strike")} label="删除线" onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("code")} label="行内代码" onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code2 size={15} />
        </ToolbarButton>
        <ColorPickerButton editor={editor} mode="text" />
        <ColorPickerButton editor={editor} mode="background" />
        <span className="kb-toolbar-sep" />
        <ToolbarButton active={editor.isActive("bulletList")} label="无序列表" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} label="有序列表" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("taskList")} label="待办列表" onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <CheckSquare size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("blockquote")} label="引用" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("codeBlock")} label="代码块" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 size={15} />
        </ToolbarButton>
        <span className="kb-toolbar-sep" />
        <ToolbarButton label="分割线" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("link")} label="链接" onClick={setLink}>
          <Link2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="图片" onClick={addImage}>
          <ImageIcon size={15} />
        </ToolbarButton>
        <ToolbarButton label="表格" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table2 size={15} />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
