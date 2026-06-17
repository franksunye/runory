import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  MoreHorizontal,
  PlugZap,
  Receipt,
  RefreshCw,
  Settings,
  Store,
  UploadCloud
} from "lucide-react";
import { useRunoryData } from "./hooks";
import { DashboardPage } from "./DashboardPage";
import { ExpenseIntakePage } from "./ExpenseIntakePage";

const iconMap = {
  "layout-dashboard": LayoutDashboard,
  receipt: Receipt
};

export function App() {
  const data = useRunoryData();
  const location = useLocation();
  const pageTitle = location.pathname.includes("expense") ? "费用录入与审核" : "欢迎使用小饭馆财务工作区";

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">R</div>
          <div>
            <div className="brand-name">Runory</div>
            <div className="brand-subtitle">Restaurant Finance</div>
          </div>
        </div>

        <nav className="nav-stack" aria-label="Runory navigation">
          {data.navigation.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap] ?? FileText;
            return (
              <NavLink key={item.id} className="nav-item" to={item.route}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          <Link className="nav-item muted" to="/dashboard">
            <Store size={18} />
            <span>供应商</span>
          </Link>
          <Link className="nav-item muted" to="/dashboard">
            <BarChart3 size={18} />
            <span>报表</span>
          </Link>
          <Link className="nav-item muted" to="/dashboard">
            <Settings size={18} />
            <span>设置</span>
          </Link>
        </nav>

        <div className="sidebar-user">
          <div className="avatar">小</div>
          <div>
            <div className="user-name">小饭馆</div>
            <div className="user-role">管理员</div>
          </div>
          <ChevronDown size={16} />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Runory · {data.workspace?.slug ?? "restaurant-finance"}</div>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <StatusPill ok label={data.sseStatus === "connected" ? "数据实时同步" : "正在连接"} />
            <button className="icon-button" onClick={() => data.refresh()} aria-label="刷新">
              <RefreshCw size={17} />
            </button>
            <button className="icon-button" aria-label="更多">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </header>

        <Routes>
          <Route path="/dashboard" element={<DashboardPage {...data} />} />
          <Route path="/expense/intake" element={<ExpenseIntakePage {...data} />} />
        </Routes>

        <footer className="statusbar">
          <span>
            <CheckCircle2 size={16} /> Runory Runtime 已连接
          </span>
          <span>
            <PlugZap size={16} /> 费用录入能力就绪
          </span>
          <span>
            <Activity size={16} /> 实时同步{data.sseStatus === "connected" ? "正常" : "等待重连"}
          </span>
          <span className="statusbar-right">
            <Bell size={16} /> 日志
          </span>
        </footer>
      </main>
    </div>
  );
}

export function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "status-pill ok" : "status-pill warn"}>
      <span />
      {label}
    </span>
  );
}

export const dashboardActions = [
  { label: "录入费用", icon: UploadCloud, to: "/expense/intake" },
  { label: "检查记录", icon: ClipboardCheck, to: "/expense/intake" },
  { label: "查看活动", icon: Activity, to: "/dashboard" },
  { label: "查看报表", icon: CircleDollarSign, to: "/dashboard" }
];
