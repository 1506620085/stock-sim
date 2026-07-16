import type { KnowledgeTreeNode, TradingRule } from "./types";

export function buildKnowledgeTree(nodes: TradingRule[]): KnowledgeTreeNode[] {
  const map = new Map<number, KnowledgeTreeNode>();
  nodes.forEach((node) => {
    map.set(node.id, { ...node, children: [], depth: 1 });
  });

  const roots: KnowledgeTreeNode[] = [];
  map.forEach((node) => {
    if (node.parentId != null && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortRecursive = (items: KnowledgeTreeNode[]) => {
    items.sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
    items.forEach((item) => sortRecursive(item.children));
  };
  sortRecursive(roots);
  return roots;
}

export function flattenVisibleTree(
  roots: KnowledgeTreeNode[],
  expandedIds: Set<number>,
): KnowledgeTreeNode[] {
  const result: KnowledgeTreeNode[] = [];

  const walk = (nodes: KnowledgeTreeNode[]) => {
    for (const node of nodes) {
      result.push(node);
      if (node.nodeType === "folder" && expandedIds.has(node.id) && node.children.length) {
        walk(node.children);
      }
    }
  };

  walk(roots);
  return result;
}

export function findNodeDepth(nodes: TradingRule[], id: number | null): number {
  if (id == null) return 0;
  let depth = 0;
  let current = nodes.find((item) => item.id === id) ?? null;
  const seen = new Set<number>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    depth += 1;
    current = current.parentId != null ? nodes.find((item) => item.id === current!.parentId) ?? null : null;
  }
  return depth;
}

type JsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
};

function collectText(node: JsonNode | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(collectText).join("");
}

export function extractTitleFromDoc(doc: Record<string, unknown>): string {
  const content = doc.content;
  if (!Array.isArray(content) || !content.length) return "";
  const first = content[0] as JsonNode;
  if (first?.type !== "heading") return "";
  return collectText(first).trim();
}

export function displayTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || "无标题笔记";
}

function titleHeadingNode(title: string): JsonNode {
  const trimmed = title.trim();
  return {
    type: "heading",
    attrs: { level: 1 },
    content: trimmed ? [{ type: "text", text: trimmed }] : undefined,
  };
}

/** 保证文档以 H1 标题开头，其后至少有一个正文节点 */
export function ensureDocTitle(doc: Record<string, unknown>, fallbackTitle = ""): Record<string, unknown> {
  const content = Array.isArray(doc.content) ? ([...doc.content] as JsonNode[]) : [];
  const first = content[0];
  const fallback = fallbackTitle.trim();
  const usableFallback = fallback && fallback !== "无标题笔记" ? fallback : "";

  if (first?.type === "heading") {
    const level = Number(first.attrs?.level ?? 1);
    const text = collectText(first).trim();
    content[0] = {
      ...first,
      attrs: { ...first.attrs, level: 1 },
      content: text
        ? first.content
        : usableFallback
          ? [{ type: "text", text: usableFallback }]
          : undefined,
    };
    if (level !== 1 && text) {
      content[0] = {
        ...content[0],
        attrs: { ...content[0].attrs, level: 1 },
      };
    }
  } else {
    content.unshift(titleHeadingNode(usableFallback));
  }

  if (content.length < 2) {
    content.push({ type: "paragraph" });
  }

  return {
    ...doc,
    type: "doc",
    content,
  };
}

/** 仅替换文档首行 H1 文本，保留正文 */
export function setDocTitleInBody(body: string, title: string): string {
  const doc = parseEditorContent(body);
  const content = Array.isArray(doc.content) ? ([...doc.content] as JsonNode[]) : [];
  content[0] = titleHeadingNode(title);
  if (content.length < 2) content.push({ type: "paragraph" });
  return JSON.stringify({ ...doc, type: "doc", content });
}

export function emptyDocContent(title = ""): string {
  return JSON.stringify({
    type: "doc",
    content: [titleHeadingNode(title), { type: "paragraph" }],
  });
}

export function parseEditorContent(body: string, fallbackTitle = ""): Record<string, unknown> {
  const trimmed = (body || "").trim();
  if (!trimmed) {
    return ensureDocTitle(JSON.parse(emptyDocContent()) as Record<string, unknown>, fallbackTitle);
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return ensureDocTitle(parsed, fallbackTitle);
    }
  } catch {
    // legacy plain text
  }
  return ensureDocTitle(
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: trimmed ? [{ type: "text", text: trimmed }] : undefined,
        },
      ],
    },
    fallbackTitle,
  );
}
