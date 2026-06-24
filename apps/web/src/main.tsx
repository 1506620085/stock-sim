import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, Calculator, CandlestickChart, NotebookPen, Settings } from "lucide-react";
import "./styles.css";

const menuItems = [
  { label: "复盘", icon: CandlestickChart, active: true },
  { label: "计算器", icon: Calculator, active: false },
  { label: "统计", icon: BarChart3, active: false },
  { label: "笔记", icon: NotebookPen, active: false },
  { label: "设置", icon: Settings, active: false },
];

function App() {
  return (
    <main className="app-shell">
      <nav className="icon-rail" aria-label="主导航">
        <div className="brand-mark">S</div>
        <div className="nav-items">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={item.active ? "active" : ""} key={item.label} title={item.label} type="button">
                <Icon aria-hidden="true" size={22} strokeWidth={2} />
                <span className="sr-only">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Stock Replay</p>
            <h1>股票 K 线复盘训练系统</h1>
          </div>
          <span className="stage-pill">正式工程骨架</span>
        </header>

        <section className="empty-state">
          <div>
            <p className="eyebrow">Stage 1</p>
            <h2>前端工作台已就绪</h2>
            <p>
              当前页面是正式 React + TypeScript + Vite 骨架。下一阶段会接入左侧菜单切换、复盘页面和工具箱计算器。
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
