export type JournalSide = "buy" | "sell" | "watch" | "other";

export type RuleCategory = "position" | "buy" | "sell" | "t_trade" | "emotion" | "other";

export type RuleStatus = "active" | "archived";

export type RuleNodeType = "folder" | "doc";

export type JournalEntry = {
  id: number;
  entryDate: string;
  side: JournalSide;
  symbolCode: string | null;
  symbolName: string | null;
  price: number | null;
  quantity: number | null;
  reason: string;
  planNote: string | null;
  emotionScore: number | null;
  emotionNote: string | null;
  resultNote: string | null;
  tags: string[];
  ruleIds: number[];
  createdAt: string;
  updatedAt: string;
};

export type JournalEntryInput = {
  entryDate: string;
  side: JournalSide;
  symbolCode?: string | null;
  symbolName?: string | null;
  price?: number | null;
  quantity?: number | null;
  reason: string;
  planNote?: string | null;
  emotionScore?: number | null;
  emotionNote?: string | null;
  resultNote?: string | null;
  tags?: string[];
  ruleIds?: number[];
};

export type TradingRule = {
  id: number;
  title: string;
  body: string;
  category: RuleCategory;
  status: RuleStatus;
  tags: string[];
  parentId: number | null;
  nodeType: RuleNodeType;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TradingRuleInput = {
  title: string;
  body?: string;
  category?: RuleCategory;
  status?: RuleStatus;
  tags?: string[];
  parentId?: number | null;
  nodeType?: RuleNodeType;
  sortOrder?: number;
};

export type TradingRuleReorderItem = {
  id: number;
  parentId: number | null;
  sortOrder: number;
};

export type JournalPeriodSummary = {
  startDate: string;
  endDate: string;
  entryCount: number;
  sideStats: Array<{ side: string; count: number }>;
  tagStats: Array<{ tag: string; count: number }>;
  emotionAvg: number | null;
  emotionCount: number;
  ruleRefCount: number;
  entries: JournalEntry[];
};

export type KnowledgeTreeNode = TradingRule & {
  children: KnowledgeTreeNode[];
  depth: number;
};
