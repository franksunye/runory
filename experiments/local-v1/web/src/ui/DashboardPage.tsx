import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleDollarSign, Clock3, DatabaseZap, Receipt, Sparkles, TrendingUp } from "lucide-react";
import type { DashboardSummary, ExpenseRecord } from "../api";
import { day, money, time } from "./format";
import { dashboardActions } from "./App";
import { MiniTrend } from "./MiniTrend";

interface DashboardPageProps {
  dashboard: DashboardSummary;
  expenses: ExpenseRecord[];
  lastEventAt: string | null;
}

export function DashboardPage({ dashboard, expenses, lastEventAt }: DashboardPageProps) {
  const latest = expenses[0];

  return (
    <div className="page-grid dashboard-grid">
      <section className="hero-panel">
        <div>
          <div className="eyebrow">
            <Sparkles size={16} /> 智能财务工作区
          </div>
          <h2>欢迎使用小饭馆财务工作区</h2>
          <p>集中管理费用、供应商与经营数据。新的费用录入后，工作区会自动同步最新状态。</p>
        </div>
        <div className="hero-signal">
          <DatabaseZap size={22} />
          <span>{lastEventAt ? `最近同步 ${time(lastEventAt)}` : "等待 Codex 写入第一条费用"}</span>
        </div>
      </section>

      <div className="kpi-row">
        <KpiCard title="本月费用" value={money(dashboard.monthExpenseTotal)} note="来自已入账记录" icon={<CircleDollarSign size={18} />} tone="blue" />
        <KpiCard title="本月记录数" value={String(dashboard.monthExpenseCount)} note="条费用" icon={<Receipt size={18} />} tone="green" />
        <KpiCard title="待确认" value={String(dashboard.reviewCount)} note="需人工复核" icon={<Clock3 size={18} />} tone="orange" />
        <KpiCard title="实时同步" value="正常" note="页面数据已连接" icon={<CheckCircle2 size={18} />} tone="purple" />
      </div>

      <section className="panel trend-panel dashboard-trend-panel">
        <div className="panel-header">
          <div>
            <h3>本月费用趋势</h3>
            <p>{latest ? `最近一笔：${latest.vendorName} · ${day(latest.expenseDate)}` : "等待第一条费用入账"}</p>
          </div>
          <TrendingUp size={18} />
        </div>
        <MiniTrend data={dashboard.trend} />
      </section>

      <section className="panel activity-panel dashboard-activity-panel">
        <div className="panel-header">
          <h3>近期活动</h3>
        </div>
        {dashboard.recentActivity.length === 0 ? (
          <EmptyState title="还没有费用数据" detail="在 Codex 中提供费用信息后，Runory 会自动入账并更新当前工作区。" />
        ) : (
          <div className="activity-list">
            {dashboard.recentActivity.map((activity) => (
              <div className="activity-item" key={activity.id}>
                <span className="activity-dot" />
                <div>
                  <strong>{activity.title}</strong>
                  <p>{activity.detail}</p>
                </div>
                <time>{time(activity.createdAt)}</time>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel quick-panel">
        <div className="panel-header">
          <h3>快速操作</h3>
        </div>
        <div className="quick-list">
          {dashboardActions.map((action) => (
            <Link className="quick-action" to={action.to} key={action.label}>
              <action.icon size={18} />
              <span>{action.label}</span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </section>

      <section className="panel capability-panel dashboard-capability-panel">
        <div className="panel-header">
          <div>
            <h3>已启用的能力</h3>
            <p>当前工作区已准备好费用录入、规则校验和实时看板能力。</p>
          </div>
        </div>
        <div className="capability-list">
          <Capability title="费用入账" detail="记录供应商、日期、金额、分类与来源" status="已启用" />
          <Capability title="规则校验" detail="自动检查金额、日期、置信度和录入来源" status="已启用" />
          <Capability title="实时看板" detail="费用变化后自动更新指标、活动和趋势" status="已启用" />
        </div>
      </section>
    </div>
  );
}

function KpiCard(props: { title: string; value: string; note: string; icon: React.ReactNode; tone: string }) {
  return (
    <section className={`kpi-card ${props.tone}`}>
      <div className="kpi-title">
        <span>{props.title}</span>
        <div className="kpi-icon">{props.icon}</div>
      </div>
      <strong>{props.value}</strong>
      <p>{props.note}</p>
    </section>
  );
}

function Capability({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="capability-item">
      <div className="capability-icon">
        <CheckCircle2 size={18} />
      </div>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <span>{status}</span>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <Receipt size={24} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
