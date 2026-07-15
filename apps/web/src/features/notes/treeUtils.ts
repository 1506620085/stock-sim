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

export function emptyDocContent(): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph" }],
  });
}

export function parseEditorContent(body: string): Record<string, unknown> {
  const trimmed = (body || "").trim();
  if (!trimmed) {
    return JSON.parse(emptyDocContent()) as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return parsed;
    }
  } catch {
    // legacy plain text
  }
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: trimmed ? [{ type: "text", text: trimmed }] : undefined,
      },
    ],
  };
}
