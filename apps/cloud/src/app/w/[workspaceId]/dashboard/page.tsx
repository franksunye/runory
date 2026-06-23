"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight, CheckCircle2, Clock, Database,
  PackagePlus, Plus, TrendingUp, Users, UserPlus,
  CheckSquare, ListChecks, RefreshCw,
} from "lucide-react";
import { notifyWorkspaceNavigationChanged, notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useWorkspaceChangeEvent } from "@/lib/api-hooks";

const CRM_LITE_PACK_ID = "crm-lite-pack";

// ── Types ──

interface BusinessMetrics {
  customers: { total: number; newThisWeek: number };
  contacts: { total: number; newThisWeek: number };
  tasks: {
    total: number; todo: number; inProgress: number; done: number;
    dueToday: number; overdue: number;
  };
}

interface TrendPoint {
  date: string; customers: number; contacts: number; tasks: number;
}

interface OpenTask {
  id: string; title: string; status: string; priority: string;
  due_date: string | null; assignee: string | null;
}

interface RecentCustomer {
  id: string; name: string; email: string | null; phone: string | null;
  created_at: string;
}

interface ActivityEvent {
  id: string; action: string; entity_type: string; entity_id: string;
  created_at: string; actor_type: string; actor_id: string;
  after_json: string | null;
}

interface StatsData {
  hasPack: boolean;
  metrics: BusinessMetrics | null;
  trends: TrendPoint[] | null;
  taskStatusBreakdown: { todo: number; inProgress: number; done: number } | null;
  openTasks: OpenTask[];
  recentCustomers: RecentCustomer[];
  recentActivity: ActivityEvent[];
}

// ── Helpers ──

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function formatDueDate(dateStr: string | null): { text: string; urgent: boolean } {
  if (!dateStr) return { text: "无截止日期", urgent: false };
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return { text: `已逾期 ${Math.abs(diffDays)} 天`, urgent: true };
  if (diffDays === 0) return { text: "今天到期", urgent: true };
  if (diffDays === 1) return { text: "明天到期", urgent: false };
  if (diffDays < 7) return { text: `${diffDays} 天后到期`, urgent: false };
  return { text: due.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }), urgent: false };
}

function translateAction(action: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    "record.create": { label: "新增了记录", color: "text-emerald-600" },
    "record.update": { label: "更新了记录", color: "text-blue-600" },
    "record.delete": { label: "删除了记录", color: "text-red-600" },
    "extension.apply": { label: "应用了扩展", color: "text-violet-600" },
    "extension.rollback": { label: "回滚了扩展", color: "text-orange-600" },
    "api_key.create": { label: "创建了 API 密钥", color: "text-slate-600" },
    "api_key.revoke": { label: "撤销了 API 密钥", color: "text-slate-600" },
  };
  return map[action] ?? { label: action, color: "text-slate-600" };
}

function getEntityName(event: ActivityEvent): string {
  if (!event.after_json) return event.entity_id;
  try {
    const after = JSON.parse(event.after_json);
    return after.name ?? after.title ?? after.label ?? event.entity_id;
  } catch {
    return event.entity_id;
  }
}

// ── Trend Chart (simple SVG bar chart) ──

function TrendChart({ trends }: { trends: TrendPoint[] }) {
  if (!trends || trends.length === 0) return null;

  const maxValue = Math.max(...trends.flatMap((t) => [t.customers, t.contacts, t.tasks]), 1);
  const barWidth = 100 / trends.length;

  return (
    <div className="app-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <TrendingUp size={18} className="text-indigo-600" />
            近 14 天新增趋势
          </h3>
          <p className="mt-1 text-xs text-slate-500">客户、联系人、任务的每日新增量</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-indigo-500" />客户</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-emerald-500" />联系人</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-amber-500" />任务</span>
        </div>
      </div>
      <div className="relative h-40">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          {/* Grid lines */}
          {[25, 50, 75, 100].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#e2e8f0" strokeWidth="0.3" />
          ))}
          {/* Bars */}
          {trends.map((t, i) => {
            const x = i * barWidth + barWidth * 0.15;
            const w = barWidth * 0.7;
            const groupWidth = w / 3;
            return (
              <g key={t.date}>
                <rect x={x} y={100 - (t.customers / maxValue) * 100} width={groupWidth * 0.85} height={(t.customers / maxValue) * 100} fill="#6366f1" rx="0.3" />
                <rect x={x + groupWidth} y={100 - (t.contacts / maxValue) * 100} width={groupWidth * 0.85} height={(t.contacts / maxValue) * 100} fill="#10b981" rx="0.3" />
                <rect x={x + groupWidth * 2} y={100 - (t.tasks / maxValue) * 100} width={groupWidth * 0.85} height={(t.tasks / maxValue) * 100} fill="#f59e0b" rx="0.3" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{trends[0]?.date.slice(5)}</span>
        <span>{trends[Math.floor(trends.length / 2)]?.date.slice(5)}</span>
        <span>{trends[trends.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function DashboardPage() {
  const workspaceId = useParams().workspaceId as string;
  const [installing, setInstalling] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useWorkspaceChangeEvent(workspaceId);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/stats`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Initial load + poll every 30s for fresh data
  useEffect(() => {
    void loadStats();
    const interval = setInterval(() => void loadStats(), 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const handleInstallPack = async () => {
    setInstalling(true); setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/packs/${CRM_LITE_PACK_ID}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ includeDemoData: false }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error?.message ?? "安装失败");
      notifyWorkspaceNavigationChanged(); notifyWorkspaceDataChanged();
      await loadStats();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "安装失败"); }
    finally { setInstalling(false); }
  };

  const handleSeedDemo = async () => {
    setSeeding(true); setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/seed-demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error?.message ?? "加载示例数据失败");
      notifyWorkspaceDataChanged();
      await loadStats();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "加载示例数据失败"); }
    finally { setSeeding(false); }
  };

  if (loading) return <DashboardSkeleton />;

  const hasPack = stats?.hasPack ?? false;
  const hasData = (stats?.metrics?.customers.total ?? 0) > 0;

  // ── Empty State: No Pack ──
  if (!hasPack) {
    return (
      <div className="space-y-6">
        <header>
          <p className="app-eyebrow">Workbench</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">工作台</h1>
          <p className="mt-2 text-sm text-slate-500">今天需要关注什么？</p>
        </header>
        {error && <div role="alert" className="app-error">{error}</div>}
        <div className="app-card overflow-hidden bg-[linear-gradient(110deg,#fff_0%,#fff_58%,#f0f2ff_100%)] p-8 sm:p-12">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-indigo-100">
              <PackagePlus size={32} className="text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">从安装 CRM Lite 开始</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              CRM Lite 提供客户、联系人和任务管理。安装后即可加载示例数据，立即体验完整的业务工作台。
            </p>
            <button onClick={handleInstallPack} disabled={installing} className="app-button-primary mt-6">
              <PackagePlus size={18} />{installing ? "正在安装..." : "安装 CRM Lite Pack"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty State: Pack installed but no data ──
  if (!hasData) {
    return (
      <div className="space-y-6">
        <header>
          <p className="app-eyebrow">Workbench</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">工作台</h1>
          <p className="mt-2 text-sm text-slate-500">今天需要关注什么？</p>
        </header>
        {error && <div role="alert" className="app-error">{error}</div>}
        <div className="app-card p-8 sm:p-12">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-emerald-100">
              <Database size={32} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">业务工作台已就绪</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              CRM Lite 已安装。加载示例数据可以立即看到客户、联系人和任务的完整业务视图，帮助你快速了解 Runory 的能力。
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button onClick={handleSeedDemo} disabled={seeding} className="app-button-primary">
                <Database size={18} />{seeding ? "正在加载..." : "加载示例数据"}
              </button>
              <Link href={`/w/${workspaceId}/customers/new`} className="app-button-secondary">
                <Plus size={18} />手动创建
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Business Workbench ──
  const m = stats!.metrics!;
  const trends = stats!.trends ?? [];
  const openTasks = stats!.openTasks ?? [];
  const recentCustomers = stats!.recentCustomers ?? [];
  const recentActivity = stats!.recentActivity ?? [];

  const metricCards = [
    {
      label: "客户总数", value: m.customers.total, sub: `本周新增 ${m.customers.newThisWeek}`,
      icon: Users, tone: "bg-indigo-50 text-indigo-600", link: `/w/${workspaceId}/customers`,
    },
    {
      label: "联系人", value: m.contacts.total, sub: `本周新增 ${m.contacts.newThisWeek}`,
      icon: UserPlus, tone: "bg-emerald-50 text-emerald-600", link: `/w/${workspaceId}/contacts`,
    },
    {
      label: "待办任务", value: m.tasks.todo + m.tasks.inProgress,
      sub: m.tasks.overdue > 0 ? `${m.tasks.overdue} 个已逾期` : `${m.tasks.dueToday} 个今日到期`,
      icon: ListChecks, tone: m.tasks.overdue > 0 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600",
      link: `/w/${workspaceId}/tasks`,
    },
    {
      label: "已完成任务", value: m.tasks.done, sub: `共 ${m.tasks.total} 个任务`,
      icon: CheckCircle2, tone: "bg-green-50 text-green-600", link: `/w/${workspaceId}/tasks`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Workbench</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">工作台</h1>
          <p className="mt-2 text-sm text-slate-500">今天需要关注什么？</p>
        </div>
        <button onClick={() => void loadStats()} className="app-button-secondary self-start">
          <RefreshCw size={16} />刷新
        </button>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}

      {/* Business Metrics */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map(({ label, value, sub, icon: Icon, tone, link }) => (
          <Link key={label} href={link} className="app-card group p-5 transition hover:border-indigo-200 hover:shadow-sm">
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-slate-600">{label}</p>
              <span className={`grid size-9 place-items-center rounded-lg ${tone}`}><Icon size={18} /></span>
            </div>
            <strong className="mt-5 block text-3xl tracking-tight text-slate-950">{value}</strong>
            <p className="mt-1 text-xs text-slate-500">{sub}</p>
          </Link>
        ))}
      </section>

      {/* Trend Chart */}
      {trends.length > 0 && <TrendChart trends={trends} />}

      {/* Key Business Lists */}
      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Open Tasks */}
        <article className="app-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <Clock size={18} className="text-amber-600" />
                待办任务
              </h3>
              <p className="mt-1 text-xs text-slate-500">需要关注的任务</p>
            </div>
            <Link href={`/w/${workspaceId}/tasks`} className="flex items-center gap-1 text-xs font-bold text-indigo-600">
              查看全部 <ArrowRight size={14} />
            </Link>
          </div>
          {openTasks.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-4 py-8 text-center">
              <CheckCircle2 size={24} className="mx-auto text-emerald-500" />
              <p className="mt-2 text-sm text-slate-500">所有任务都已完成</p>
            </div>
          ) : (
            <div className="space-y-2">
              {openTasks.map((task) => {
                const due = formatDueDate(task.due_date);
                const priorityBadge: Record<string, string> = {
                  urgent: "bg-red-100 text-red-700",
                  high: "bg-orange-100 text-orange-700",
                  medium: "bg-blue-100 text-blue-700",
                  low: "bg-slate-100 text-slate-600",
                };
                const priorityLabel: Record<string, string> = {
                  urgent: "紧急", high: "高", medium: "中", low: "低",
                };
                return (
                  <Link
                    key={task.id}
                    href={`/w/${workspaceId}/tasks/${task.id}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 transition hover:border-indigo-200 hover:bg-indigo-50/30"
                  >
                    <CheckSquare size={16} className="shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${priorityBadge[task.priority] ?? priorityBadge.low}`}>
                          {priorityLabel[task.priority] ?? task.priority}
                        </span>
                        <span className={due.urgent ? "font-semibold text-red-600" : "text-slate-400"}>
                          {due.text}
                        </span>
                        {task.assignee && <span className="text-slate-400">· {task.assignee}</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </article>

        {/* Recent Customers */}
        <article className="app-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <Users size={18} className="text-indigo-600" />
                最近客户
              </h3>
              <p className="mt-1 text-xs text-slate-500">近期新增的客户</p>
            </div>
            <Link href={`/w/${workspaceId}/customers`} className="flex items-center gap-1 text-xs font-bold text-indigo-600">
              查看全部 <ArrowRight size={14} />
            </Link>
          </div>
          {recentCustomers.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-4 py-8 text-center">
              <Users size={24} className="mx-auto text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">还没有客户记录</p>
              <Link href={`/w/${workspaceId}/customers/new`} className="mt-2 inline-block text-xs font-bold text-indigo-600">
                添加第一个客户
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentCustomers.map((customer) => (
                <Link
                  key={customer.id}
                  href={`/w/${workspaceId}/customers/${customer.id}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 transition hover:border-indigo-200 hover:bg-indigo-50/30"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                    {customer.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{customer.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {customer.email ?? customer.phone ?? "无联系方式"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{formatRelativeTime(customer.created_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>

      {/* Business Activity Feed */}
      <article className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-slate-900">
              <TrendingUp size={18} className="text-slate-600" />
              业务动态
            </h3>
            <p className="mt-1 text-xs text-slate-500">最近的业务变更</p>
          </div>
          <Link href={`/w/${workspaceId}/activity`} className="flex items-center gap-1 text-xs font-bold text-indigo-600">
            查看全部 <ArrowRight size={14} />
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">暂无业务动态</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((event) => {
              const translated = translateAction(event.action);
              const entityName = getEntityName(event);
              return (
                <div key={event.id} className="flex items-start gap-3">
                  <div className="mt-1.5 size-2 shrink-0 rounded-full bg-slate-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">
                      <span className={`font-semibold ${translated.color}`}>{translated.label}</span>
                      {entityName !== event.entity_id && (
                        <span className="ml-1 font-medium text-slate-800">{entityName}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {event.actor_type === "agent" ? "Agent" : event.actor_type === "system" ? "系统" : "用户"} · {formatRelativeTime(event.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="正在加载工作台">
      <div className="h-20 w-1/3 rounded-xl bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((key) => <div key={key} className="h-32 rounded-2xl bg-slate-200" />)}
      </div>
      <div className="h-48 rounded-2xl bg-slate-200" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-slate-200" />
        <div className="h-64 rounded-2xl bg-slate-200" />
      </div>
    </div>
  );
}
