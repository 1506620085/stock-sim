import { useEffect, useMemo, useState } from "react";
import { BarChart3, Calculator, CandlestickChart, NotebookPen, Settings } from "lucide-react";
import { ReplayPage } from "./features/replay/ReplayPage";

type PageId = "replay" | "calculators" | "stats" | "notes" | "settings";

type MenuItem = {
  id: PageId;
  label: string;
  path: string;
  icon: typeof CandlestickChart;
};

const menuItems: MenuItem[] = [
  { id: "replay", label: "复盘", path: "/replay", icon: CandlestickChart },
  { id: "calculators", label: "计算器", path: "/calculators", icon: Calculator },
  { id: "stats", label: "统计", path: "/stats", icon: BarChart3 },
  { id: "notes", label: "笔记", path: "/notes", icon: NotebookPen },
  { id: "settings", label: "设置", path: "/settings", icon: Settings },
];

const pageMeta: Record<PageId, { eyebrow: string; title: string; badge: string }> = {
  replay: { eyebrow: "Replay", title: "K 线复盘工作台", badge: "默认页面" },
  calculators: { eyebrow: "Tools", title: "交易计算器", badge: "工具箱" },
  stats: { eyebrow: "Analytics", title: "训练统计", badge: "规划中" },
  notes: { eyebrow: "Journal", title: "交易笔记", badge: "规划中" },
  settings: { eyebrow: "Preferences", title: "系统设置", badge: "规划中" },
};

function pageFromPath(pathname: string): PageId {
  const match = menuItems.find((item) => item.path === pathname);
  return match?.id ?? "replay";
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>(() => pageFromPath(window.location.pathname));
  const activeMeta = pageMeta[activePage];

  useEffect(() => {
    const handlePopState = () => setActivePage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeMenu = useMemo(() => menuItems.find((item) => item.id === activePage) ?? menuItems[0], [activePage]);

  function navigate(item: MenuItem) {
    setActivePage(item.id);
    if (window.location.pathname !== item.path) {
      window.history.pushState({}, "", item.path);
    }
  }

  return (
    <main className="app-shell">
      <nav className="icon-rail" aria-label="主导航">
        <div className="brand-mark" aria-label="Stock Sim">
          S
        </div>
        <div className="nav-items">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activePage;
            return (
              <button
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                className={isActive ? "active" : ""}
                key={item.id}
                onClick={() => navigate(item)}
                title={item.label}
                type="button"
              >
                <Icon aria-hidden="true" size={22} strokeWidth={2} />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeMeta.eyebrow}</p>
            <h1>{activeMeta.title}</h1>
          </div>
          <span className="stage-pill">{activeMeta.badge}</span>
        </header>

        <PageContent activePage={activeMenu.id} />
      </section>
    </main>
  );
}

function PageContent({ activePage }: { activePage: PageId }) {
  if (activePage === "replay") {
    return <ReplayPage />;
  }

  if (activePage === "calculators") {
    return (
      <section className="page-grid calculator-layout">
        {["利润成本", "做 T", "涨跌幅", "平均价格"].map((name) => (
          <article className="panel calculator-card" key={name}>
            <Calculator aria-hidden="true" size={24} strokeWidth={1.8} />
            <div>
              <p className="eyebrow">Calculator</p>
              <h2>{name}计算器</h2>
            </div>
          </article>
        ))}
      </section>
    );
  }

  const copy: Record<Exclude<PageId, "replay" | "calculators">, string[]> = {
    stats: ["胜率", "盈亏比", "错因标签", "复盘日历"],
    notes: ["交易笔记", "区间复盘", "情绪记录", "标签归档"],
    settings: ["数据源", "复权方式", "费率模板", "主题配置"],
  };

  return (
    <section className="panel empty-state">
      <div>
        <p className="eyebrow">Coming Next</p>
        <h2>{pageMeta[activePage].title}</h2>
        <div className="placeholder-list inline-list">
          {copy[activePage].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
