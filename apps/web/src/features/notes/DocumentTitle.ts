import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

function isTitleNode(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(node && node.type.name === "heading" && node.attrs.level === 1);
}

/** 当前选区是否在文档首行标题（第一个节点）内 */
export function isInDocumentTitle(state: EditorState): boolean {
  const first = state.doc.firstChild;
  if (!isTitleNode(first)) return false;
  const { $from } = state.selection;
  return $from.depth >= 1 && $from.index(0) === 0 && $from.parent === first;
}

function ensureTitleStructure(state: EditorState): Transaction | null {
  const { doc, schema } = state;
  const heading = schema.nodes.heading;
  const paragraph = schema.nodes.paragraph;
  if (!heading || !paragraph) return null;

  let nextDoc = doc;
  let tr = state.tr;
  let changed = false;

  const first = nextDoc.firstChild;
  if (!first) {
    tr = tr.insert(0, heading.create({ level: 1 }));
    tr = tr.insert(tr.doc.firstChild!.nodeSize, paragraph.create());
    return tr;
  }

  if (first.type.name === "heading" && first.attrs.level !== 1) {
    tr = tr.setNodeMarkup(0, heading, { ...first.attrs, level: 1 });
    changed = true;
    nextDoc = tr.doc;
  } else if (first.type.name !== "heading") {
    tr = tr.setBlockType(0, first.nodeSize, heading, { level: 1 });
    changed = true;
    nextDoc = tr.doc;
  }

  if (nextDoc.childCount < 2) {
    const titleSize = nextDoc.firstChild!.nodeSize;
    tr = tr.insert(titleSize, paragraph.create());
    changed = true;
  }

  return changed ? tr : null;
}

/**
 * 将文档第一行锁定为 H1 标题：
 * - Enter：在标题下新建段落并聚焦正文
 * - 禁止删除/降级首行标题
 * - 空文档自动补齐「标题 + 段落」
 */
export const DocumentTitle = Extension.create({
  name: "documentTitle",

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!isInDocumentTitle(editor.state)) return false;

        const { state } = editor;
        const title = state.doc.firstChild;
        if (!title) return false;

        // 光标在标题中间：后半段拆到新段落；在末尾：直接新建空段落
        const atEnd = state.selection.empty && state.selection.$from.parentOffset === title.content.size;
        if (atEnd) {
          const insertPos = title.nodeSize;
          return editor
            .chain()
            .command(({ tr, dispatch }) => {
              const paragraph = state.schema.nodes.paragraph.create();
              tr.insert(insertPos, paragraph);
              tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
              if (dispatch) dispatch(tr.scrollIntoView());
              return true;
            })
            .run();
        }

        return editor.chain().splitBlock().setParagraph().run();
      },

      Backspace: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;

        if (isInDocumentTitle(state)) {
          // 标题开头按退格：不删除标题节点
          if (selection.empty && selection.$from.parentOffset === 0) {
            return true;
          }
          return false;
        }

        // 正文第一个节点开头退格时，避免把标题节点删掉或与标题合并成段落
        const first = state.doc.firstChild;
        if (!isTitleNode(first) || state.doc.childCount < 2) return false;
        if (!selection.empty || selection.$from.parentOffset !== 0) return false;
        if (selection.$from.index(0) !== 1) return false;
        return true;
      },

      "Mod-Alt-0": ({ editor }) => {
        if (isInDocumentTitle(editor.state)) return true;
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("documentTitleGuard"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((item) => item.docChanged)) return null;
          return ensureTitleStructure(newState);
        },
      }),
    ];
  },
});
