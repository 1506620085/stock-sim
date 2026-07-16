import type { TradingRule, TradingRuleInput, TradingRuleReorderItem } from "./types";
import { emptyDocContent } from "./treeUtils";

/** 操作规则/总结笔记暂用本地 mock，切回 API 时关闭此开关即可。 */
export const USE_RULES_MOCK = true;

const now = () => new Date().toISOString();

function docBody(title: string, paragraphs: string[]): string {
  return JSON.stringify({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: title ? [{ type: "text", text: title }] : undefined,
      },
      ...paragraphs.map((text) => ({
        type: "paragraph",
        content: text ? [{ type: "text", text }] : undefined,
      })),
    ],
  });
}

const seedRules: TradingRule[] = [
  {
    id: 1,
    title: "操作规则",
    body: "",
    category: "other",
    status: "active",
    tags: [],
    parentId: null,
    nodeType: "folder",
    sortOrder: 0,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
  },
  {
    id: 2,
    title: "总结笔记",
    body: "",
    category: "other",
    status: "active",
    tags: [],
    parentId: null,
    nodeType: "folder",
    sortOrder: 1,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
  },
  {
    id: 3,
    title: "买入规则",
    body: "",
    category: "buy",
    status: "active",
    tags: [],
    parentId: 1,
    nodeType: "folder",
    sortOrder: 0,
    createdAt: "2026-07-01T08:10:00.000Z",
    updatedAt: "2026-07-01T08:10:00.000Z",
  },
  {
    id: 4,
    title: "卖出规则",
    body: "",
    category: "sell",
    status: "active",
    tags: [],
    parentId: 1,
    nodeType: "folder",
    sortOrder: 1,
    createdAt: "2026-07-01T08:10:00.000Z",
    updatedAt: "2026-07-01T08:10:00.000Z",
  },
  {
    id: 5,
    title: "仓位管理",
    body: "",
    category: "position",
    status: "active",
    tags: [],
    parentId: 1,
    nodeType: "folder",
    sortOrder: 2,
    createdAt: "2026-07-01T08:10:00.000Z",
    updatedAt: "2026-07-01T08:10:00.000Z",
  },
  {
    id: 6,
    title: "MACD 金叉买入策略",
    body: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "MACD 金叉买入策略" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "当 DIF 上穿 DEA，且位于零轴附近或零轴上方时，结合量能确认后分批买入。",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "注意事项" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "避免追高" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "放量突破更可靠" }] }],
            },
          ],
        },
      ],
    }),
    category: "buy",
    status: "active",
    tags: ["MACD", "买入"],
    parentId: 3,
    nodeType: "doc",
    sortOrder: 0,
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z",
  },
  {
    id: 7,
    title: "跌破均线减仓",
    body: docBody("跌破均线减仓", [
      "收盘跌破 20 日均线且放量时，先减掉一半仓位。",
      "若次日无法收回均线，继续清到底仓。",
    ]),
    category: "sell",
    status: "active",
    tags: ["止损"],
    parentId: 4,
    nodeType: "doc",
    sortOrder: 0,
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
  },
  {
    id: 8,
    title: "单票仓位上限",
    body: docBody("单票仓位上限", ["单票仓位不超过总资金 20%。", "同一板块合计不超过 40%。"]),
    category: "position",
    status: "active",
    tags: ["仓位"],
    parentId: 5,
    nodeType: "doc",
    sortOrder: 0,
    createdAt: "2026-07-04T09:00:00.000Z",
    updatedAt: "2026-07-04T09:00:00.000Z",
  },
  {
    id: 9,
    title: "2026-07-01",
    body: docBody("2026-07-01", ["复盘：今日纪律执行较好，未追涨。", "下次关注量能是否配合。"]),
    category: "other",
    status: "active",
    tags: ["复盘"],
    parentId: 2,
    nodeType: "doc",
    sortOrder: 0,
    createdAt: "2026-07-01T16:00:00.000Z",
    updatedAt: "2026-07-01T16:00:00.000Z",
  },
  {
    id: 10,
    title: "2026-07-02",
    body: docBody("2026-07-02", ["情绪偏急，差点提前入场。", "等确认后再动手。"]),
    category: "other",
    status: "active",
    tags: ["情绪"],
    parentId: 2,
    nodeType: "doc",
    sortOrder: 1,
    createdAt: "2026-07-02T16:00:00.000Z",
    updatedAt: "2026-07-02T16:00:00.000Z",
  },
];

let mockRules: TradingRule[] = seedRules.map((item) => ({
  ...item,
  tags: [...item.tags],
}));
let nextId = mockRules.reduce((max, item) => Math.max(max, item.id), 0) + 1;

function delay(ms = 80) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneRule(rule: TradingRule): TradingRule {
  return { ...rule, tags: [...rule.tags] };
}

function collectDescendantIds(rootId: number): number[] {
  const result: number[] = [];
  const walk = (parentId: number) => {
    mockRules
      .filter((item) => item.parentId === parentId)
      .forEach((child) => {
        result.push(child.id);
        walk(child.id);
      });
  };
  walk(rootId);
  return result;
}

function nextSortOrder(parentId: number | null): number {
  const siblings = mockRules.filter((item) => item.parentId === parentId);
  if (!siblings.length) return 0;
  return Math.max(...siblings.map((item) => item.sortOrder)) + 1;
}

export async function mockLoadTradingRules(filters?: {
  status?: string;
  category?: string;
  nodeType?: string;
}): Promise<TradingRule[]> {
  await delay();
  let items = mockRules.map(cloneRule);
  if (filters?.status) items = items.filter((item) => item.status === filters.status);
  if (filters?.category) items = items.filter((item) => item.category === filters.category);
  if (filters?.nodeType) items = items.filter((item) => item.nodeType === filters.nodeType);
  return items.sort((a, b) => {
    const parentA = a.parentId ?? -1;
    const parentB = b.parentId ?? -1;
    if (parentA !== parentB) return parentA - parentB;
    return a.sortOrder - b.sortOrder || a.id - b.id;
  });
}

export async function mockCreateTradingRule(input: TradingRuleInput): Promise<TradingRule> {
  await delay();
  const parentId = input.parentId ?? null;
  const nodeType = input.nodeType ?? "doc";
  const rule: TradingRule = {
    id: nextId++,
    title: input.title.trim() || (nodeType === "folder" ? "新建目录" : "无标题笔记"),
    body: nodeType === "doc" ? input.body ?? emptyDocContent() : "",
    category: input.category ?? "other",
    status: input.status ?? "active",
    tags: [...(input.tags ?? [])],
    parentId,
    nodeType,
    sortOrder: input.sortOrder ?? nextSortOrder(parentId),
    createdAt: now(),
    updatedAt: now(),
  };
  mockRules = [...mockRules, rule];
  return cloneRule(rule);
}

export async function mockUpdateTradingRule(id: number, input: Partial<TradingRuleInput>): Promise<TradingRule> {
  await delay();
  const index = mockRules.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("节点不存在");
  const current = mockRules[index];
  const next: TradingRule = {
    ...current,
    title: input.title !== undefined ? input.title.trim() || current.title : current.title,
    body: input.body !== undefined ? input.body : current.body,
    category: input.category ?? current.category,
    status: input.status ?? current.status,
    tags: input.tags !== undefined ? [...input.tags] : [...current.tags],
    parentId: input.parentId !== undefined ? input.parentId : current.parentId,
    nodeType: input.nodeType ?? current.nodeType,
    sortOrder: input.sortOrder !== undefined ? input.sortOrder : current.sortOrder,
    updatedAt: now(),
  };
  mockRules = mockRules.map((item) => (item.id === id ? next : item));
  return cloneRule(next);
}

export async function mockReorderTradingRules(items: TradingRuleReorderItem[]): Promise<TradingRule[]> {
  await delay();
  const updated: TradingRule[] = [];
  for (const item of items) {
    const current = mockRules.find((rule) => rule.id === item.id);
    if (!current) throw new Error(`节点不存在: ${item.id}`);
    const next: TradingRule = {
      ...current,
      parentId: item.parentId,
      sortOrder: item.sortOrder,
      updatedAt: now(),
    };
    mockRules = mockRules.map((rule) => (rule.id === item.id ? next : rule));
    updated.push(cloneRule(next));
  }
  return updated;
}

export async function mockDeleteTradingRule(id: number): Promise<void> {
  await delay();
  const removeIds = new Set([id, ...collectDescendantIds(id)]);
  mockRules = mockRules.filter((item) => !removeIds.has(item.id));
}
