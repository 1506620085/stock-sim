import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { showError, showSuccess } from "../../components/ToastProvider";
import {
  createTradingRule,
  deleteTradingRule,
  loadTradingRules,
  reorderTradingRules,
  updateTradingRule,
} from "./api";
import { NoteEditor } from "./NoteEditor";
import {
  buildKnowledgeTree,
  displayTitle,
  emptyDocContent,
  findNodeDepth,
  flattenVisibleTree,
  setDocTitleInBody,
} from "./treeUtils";
import type { KnowledgeTreeNode, TradingRule } from "./types";

const MAX_DEPTH = 3;
const SAVE_DEBOUNCE_MS = 600;

export function KnowledgeBasePanel() {
  const [nodes, setNodes] = useState<TradingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [menuId, setMenuId] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [dragId, setDragId] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const tree = useMemo(() => buildKnowledgeTree(nodes), [nodes]);
  const selected = useMemo(() => nodes.find((item) => item.id === selectedId) ?? null, [nodes, selectedId]);

  const filteredVisible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return flattenVisibleTree(tree, expandedIds);
    }
    const matched = nodes.filter((item) => item.title.toLowerCase().includes(keyword));
    const keep = new Set<number>();
    matched.forEach((item) => {
      keep.add(item.id);
      let parentId = item.parentId;
      while (parentId != null) {
        keep.add(parentId);
        parentId = nodes.find((node) => node.id === parentId)?.parentId ?? null;
      }
    });
    const filteredTree = buildKnowledgeTree(nodes.filter((item) => keep.has(item.id)));
    const forceExpand = new Set(nodes.filter((item) => keep.has(item.id) && item.nodeType === "folder").map((item) => item.id));
    return flattenVisibleTree(filteredTree, forceExpand);
  }, [nodes, tree, expandedIds, query]);

  async function refresh(preferSelectId?: number | null) {
    setLoading(true);
    try {
      const next = await loadTradingRules();
      setNodes(next);
      setExpandedIds((current) => {
        const nextExpand = new Set(current);
        next.filter((item) => item.nodeType === "folder" && item.parentId == null).forEach((item) => nextExpand.add(item.id));
        return nextExpand;
      });
      const prefer = preferSelectId ?? selectedId;
      const docs = next.filter((item) => item.nodeType === "doc");
      if (prefer && next.some((item) => item.id === prefer)) {
        setSelectedId(prefer);
      } else if (docs.length) {
        setSelectedId(docs[0].id);
      } else {
        setSelectedId(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuId(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  function toggleExpand(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(nodeType: "folder" | "doc", parentId?: number | null) {
    let nextParentId = parentId === undefined ? null : parentId;
    if (parentId === undefined) {
      if (selected?.nodeType === "folder") {
        nextParentId = selected.id;
      } else if (selected?.parentId != null) {
        nextParentId = selected.parentId;
      }
    }

    const parentDepth = findNodeDepth(nodes, nextParentId);
    if (parentDepth >= MAX_DEPTH) {
      showError(`目录最多支持 ${MAX_DEPTH} 级`);
      return;
    }
    if (nextParentId != null) {
      const parent = nodes.find((item) => item.id === nextParentId);
      if (!parent || parent.nodeType !== "folder") {
        showError("只能在目录下创建");
        return;
      }
      setExpandedIds((current) => new Set(current).add(nextParentId));
    }

    const title = nodeType === "folder" ? "新建目录" : "无标题笔记";
    try {
      const created = await createTradingRule({
        title,
        body: nodeType === "doc" ? emptyDocContent() : "",
        nodeType,
        parentId: nextParentId,
        category: "other",
        status: "active",
      });
      await refresh(nodeType === "doc" ? created.id : selectedId);
      setRenamingId(created.id);
      setRenameDraft(created.title);
      showSuccess(nodeType === "folder" ? "目录已创建" : "笔记已创建");
    } catch {
      // toast already shown by api layer when available
    }
  }

  async function commitRename(id: number) {
    const current = nodes.find((item) => item.id === id);
    if (!current) {
      setRenamingId(null);
      return;
    }
    const title =
      renameDraft.trim() || (current.nodeType === "folder" ? "未命名" : "无标题笔记");
    setRenamingId(null);
    if (current.title === title) return;

    const patch: { title: string; body?: string } = { title };
    if (current.nodeType === "doc") {
      patch.body = setDocTitleInBody(current.body, title === "无标题笔记" ? "" : title);
    }

    const updated = await updateTradingRule(id, patch);
    setNodes((items) => items.map((item) => (item.id === id ? updated : item)));
  }

  async function handleDelete(id: number) {
    const target = nodes.find((item) => item.id === id);
    if (!target) return;
    const label = target.nodeType === "folder" ? "目录及其下全部内容" : "笔记";
    if (!window.confirm(`确认删除该${label}？`)) return;
    await deleteTradingRule(id);
    showSuccess("已删除");
    setMenuId(null);
    await refresh(selectedId === id ? null : selectedId);
  }

  function scheduleDocSave(id: number, body: string, title: string) {
    const nextTitle = displayTitle(title);
    setNodes((items) => items.map((item) => (item.id === id ? { ...item, body, title: nextTitle } : item)));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        setSaveState("saving");
        try {
          const updated = await updateTradingRule(id, { body, title: nextTitle });
          setNodes((items) =>
            items.map((item) => (item.id === id ? { ...item, title: updated.title, updatedAt: updated.updatedAt } : item)),
          );
          setSaveState("saved");
        } catch {
          setSaveState("idle");
        }
      })();
    }, SAVE_DEBOUNCE_MS);
  }

  async function handleDrop(target: KnowledgeTreeNode) {
    if (dragId == null || dragId === target.id) {
      setDragId(null);
      return;
    }
    const dragging = nodes.find((item) => item.id === dragId);
    if (!dragging) {
      setDragId(null);
      return;
    }

    let nextParentId = target.parentId;
    let insertIndex = 0;
    if (target.nodeType === "folder") {
      nextParentId = target.id;
      const siblings = nodes.filter((item) => item.parentId === nextParentId && item.id !== dragId);
      insertIndex = siblings.length;
      setExpandedIds((current) => new Set(current).add(target.id));
    } else {
      const siblings = nodes
        .filter((item) => item.parentId === target.parentId && item.id !== dragId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      insertIndex = siblings.findIndex((item) => item.id === target.id);
      if (insertIndex < 0) insertIndex = siblings.length;
      else {
        siblings.splice(insertIndex, 0, dragging);
        const payload = siblings.map((item, index) => ({
          id: item.id,
          parentId: nextParentId,
          sortOrder: index,
        }));
        setDragId(null);
        try {
          await reorderTradingRules(payload);
          await refresh(selectedId);
        } catch {
          // ignore
        }
        return;
      }
    }

    const parentDepth = findNodeDepth(nodes, nextParentId);
    if (parentDepth >= MAX_DEPTH && dragging.nodeType === "folder") {
      showError(`目录最多支持 ${MAX_DEPTH} 级`);
      setDragId(null);
      return;
    }
    if (parentDepth >= MAX_DEPTH) {
      showError(`目录最多支持 ${MAX_DEPTH} 级`);
      setDragId(null);
      return;
    }

    const siblings = nodes
      .filter((item) => item.parentId === nextParentId && item.id !== dragId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    siblings.splice(Math.min(insertIndex, siblings.length), 0, dragging);
    const payload = siblings.map((item, index) => ({
      id: item.id,
      parentId: nextParentId,
      sortOrder: index,
    }));
    setDragId(null);
    try {
      await reorderTradingRules(payload);
      await refresh(selectedId);
    } catch {
      // ignore
    }
  }

  return (
    <section className="kb-shell">
      <div className="kb-layout">
        <aside className="kb-sidebar">
          <div className="kb-sidebar-actions">
            <label className="kb-search">
              <Search size={15} aria-hidden="true" />
              <input
                aria-label="搜索笔记"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索"
                value={query}
              />
            </label>
            <button
              aria-label="新建笔记"
              className="kb-sidebar-icon-btn"
              onClick={() => void handleCreate("doc")}
              title="新建笔记"
              type="button"
            >
              <Plus size={16} />
            </button>
            <button
              aria-label="新建目录"
              className="kb-sidebar-icon-btn"
              onClick={() => void handleCreate("folder")}
              title="新建目录"
              type="button"
            >
              <FolderPlus size={16} />
            </button>
          </div>

          <div className="kb-tree">
            {loading ? <p className="kb-empty">加载中…</p> : null}
            {!loading && !filteredVisible.length ? <p className="kb-empty">暂无笔记，点击上方新建。</p> : null}

            {filteredVisible.map((node) => {
              const isSelected = selectedId === node.id;
              const isExpanded = expandedIds.has(node.id);
              return (
                <div
                  className={`kb-tree-row${isSelected ? " active" : ""}${dragId === node.id ? " dragging" : ""}`}
                  draggable
                  key={node.id}
                  onClick={() => {
                    if (node.nodeType === "folder") {
                      toggleExpand(node.id);
                      return;
                    }
                    setSelectedId(node.id);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={(event) => {
                    setDragId(node.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleDrop(node);
                  }}
                  style={{ paddingLeft: 10 + (node.depth - 1) * 14 }}
                >
                  <span className="kb-tree-expand">
                    {node.nodeType === "folder" ? (
                      isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    ) : (
                      <span className="kb-tree-expand-spacer" />
                    )}
                  </span>
                  <span className="kb-tree-icon">
                    {node.nodeType === "folder" ? <Folder size={14} /> : <FileText size={14} />}
                  </span>
                  {renamingId === node.id ? (
                    <input
                      autoFocus
                      className="kb-rename-input"
                      onBlur={() => void commitRename(node.id)}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void commitRename(node.id);
                        }
                        if (event.key === "Escape") {
                          setRenamingId(null);
                        }
                      }}
                      value={renameDraft}
                    />
                  ) : (
                    <span className="kb-tree-label">{node.title}</span>
                  )}
                  <div className="kb-tree-more" ref={menuId === node.id ? menuRef : undefined}>
                    <button
                      aria-label="更多操作"
                      className="kb-tree-more-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuId((current) => (current === node.id ? null : node.id));
                      }}
                      type="button"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {menuId === node.id ? (
                      <div className="kb-context-menu">
                        {node.nodeType === "folder" && node.depth < MAX_DEPTH ? (
                          <>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setMenuId(null);
                                void handleCreate("doc", node.id);
                              }}
                              type="button"
                            >
                              新建子笔记
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setMenuId(null);
                                void handleCreate("folder", node.id);
                              }}
                              type="button"
                            >
                              新建子目录
                            </button>
                          </>
                        ) : null}
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuId(null);
                            setRenamingId(node.id);
                            setRenameDraft(node.title);
                          }}
                          type="button"
                        >
                          重命名
                        </button>
                        <button
                          className="danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDelete(node.id);
                          }}
                          type="button"
                        >
                          <Trash2 size={13} />
                          删除
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="kb-editor-pane">
          {!selected || selected.nodeType !== "doc" ? (
            <div className="kb-editor-empty">
              <FileText size={28} />
              <p>选择一篇笔记开始编辑，或新建笔记。</p>
            </div>
          ) : (
            <NoteEditor
              content={selected.body}
              documentTitle={selected.title}
              key={selected.id}
              noteId={selected.id}
              onChange={(json, title) => scheduleDocSave(selected.id, json, title)}
              saveState={saveState}
            />
          )}
        </div>
      </div>
    </section>
  );
}
