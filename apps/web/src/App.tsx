import { useEffect, useMemo, useState } from "react";
import { BarChart3, Calculator, CandlestickChart, Dumbbell, NotebookPen, Settings, Star } from "lucide-react";
import { CalculatorsPage } from "./features/calculators/CalculatorsPage";
import { NotesPage } from "./features/notes/NotesPage";
import { ReplayPage } from "./features/replay/ReplayPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { StatsPage } from "./features/stats/StatsPage";
import { TrainingPage } from "./features/training/TrainingPage";
import { WatchlistPage } from "./features/watchlist/WatchlistPage";

type PageId = "watchlist" | "replay" | "training" | "calculators" | "stats" | "notes" | "settings";

type MenuItem = {
  id: PageId;
  label: string;
  path: string;
  icon: typeof CandlestickChart;
};

const menuItems: MenuItem[] = [
  { id: "watchlist", label: "自选", path: "/watchlist", icon: Star },
  { id: "replay", label: "复盘", path: "/replay", icon: CandlestickChart },
  { id: "training", label: "训练", path: "/training", icon: Dumbbell },
  { id: "calculators", label: "计算器", path: "/calculators", icon: Calculator },
  { id: "stats", label: "统计", path: "/stats", icon: BarChart3 },
  { id: "notes", label: "笔记", path: "/notes", icon: NotebookPen },
  { id: "settings", label: "设置", path: "/settings", icon: Settings },
];

const pageMeta: Record<PageId, { eyebrow: string; title: string; badge: string }> = {
  watchlist: { eyebrow: "Watchlist", title: "自选列表", badge: "自选管理" },
  replay: { eyebrow: "Replay", title: "K 线复盘工作台", badge: "默认页面" },
  training: { eyebrow: "Training", title: "训练", badge: "规划中" },
  calculators: { eyebrow: "Tools", title: "交易计算器", badge: "工具箱" },
  stats: { eyebrow: "Analytics", title: "训练统计", badge: "统计面板" },
  notes: { eyebrow: "Journal", title: "交易笔记", badge: "实盘与规则" },
  settings: { eyebrow: "Preferences", title: "系统设置", badge: "设置面板" },
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
        {activePage !== "replay" && activePage !== "calculators" && activePage !== "notes" ? (
          <header className="topbar">
            <div className="topbar-title-row">
              <h1>{activeMeta.title}</h1>
              <p className="eyebrow topbar-eyebrow">{activeMeta.eyebrow}</p>
            </div>
            <span className="stage-pill">{activeMeta.badge}</span>
          </header>
        ) : null}

        <PageContent activePage={activeMenu.id} />
      </section>
    </main>
  );
}

function PageContent({ activePage }: { activePage: PageId }) {
  if (activePage === "watchlist") {
    return <WatchlistPage />;
  }

  if (activePage === "replay") {
    return <ReplayPage />;
  }

  if (activePage === "training") {
    return <TrainingPage />;
  }

  if (activePage === "calculators") {
    return <CalculatorsPage />;
  }

  if (activePage === "stats") {
    return <StatsPage />;
  }

  if (activePage === "notes") {
    return <NotesPage />;
  }

  if (activePage === "settings") {
    return <SettingsPage />;
  }

  return (
    <section className="panel empty-state">
      <div>
        <p className="eyebrow">Coming Next</p>
        <h2>{pageMeta.training.title}</h2>
      </div>
    </section>
  );
}
