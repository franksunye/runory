"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity, AlertCircle, CheckCircle2, Clock, ListChecks,
  PieChart, RefreshCw, TrendingUp, Users,
} from "lucide-react";
import type { WidgetDeclaration } from "@runory/contracts";

// ── Types ──

export interface WidgetDataResponse {
  widget: WidgetDeclaration;
  data: {
    kind: string;
    count?: number;
    groups?: Array<{ key: string; count: number }>;
    records?: Array<Record<string, unknown>>;
    series?: Array<{ date: string; count: number }>;
    events?: Array<{
      id: string; action: string; entityType: string; entityId: string;
      createdAt: string; actorType: string; actorId: string;
      afterJson: string | null;
    }>;
  };
  sub?: { count: number; label: string } | null;
}

interface WidgetRendererProps {
  workspaceId: string;
  moduleId: string;
  widgetKey: string;
  instance: string;
  zone: string;
  widget: WidgetDeclaration;
  editMode?: boolean;
  onRefresh?: () => void;
}

// ── Icon mapping ──

const ICON_MAP: Record<string, typeof Users> = {
  users: Users,
  "user-plus": Users,
  "list-checks": ListChecks,
  "check-circle": CheckCircle2,
  "check-square": CheckCircle2,
  "pie-chart": PieChart,
  "trending-up": TrendingUp,
  clock: Clock,
  activity: Activity,
};

function getIcon(name: string): typeof Users {
  return ICON_MAP[name] ?? Activity;
}

// ── Tone mapping ──

const TONE_MAP: Record<string, string> = {
  indigo: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  green: "bg-green-50 text-green-600",
  red: "bg-red-50 text-red-600",
  slate: "bg-slate-100 text-slate-600",
};

function getTone(name: string): string {
  return TONE_MAP[name] ?? TONE_MAP.slate;
}

// ── Main WidgetRenderer ──

export default function WidgetRenderer({
  workspaceId,
  moduleId,
  widgetKey,
  instance,
  zone,
  widget,
  editMode = false,
  onRefresh,
}: WidgetRendererProps) {
  const [data, setData] = useState<WidgetDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ instance, zone });
      const res = await fetch(
        `/api/workspaces/${workspaceId}/widgets/${moduleId}/${widgetKey}?${params}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "加载失败");
      setData(json.data);
      setError(null);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, moduleId, widgetKey, instance, zone]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setLoading(true);
    void loadData();
    onRefresh?.();
  };

  if (loading) return <WidgetSkeleton widget={widget} />;
  if (error) return <WidgetError widget={widget} error={error} onRetry={handleRefresh} />;
  if (!data) return null;

  return (
    <div className="relative">
      {editMode && <EditModeOverlay widget={widget} />}
      <WidgetContent widget={widget} data={data} workspaceId={workspaceId} onRefresh={handleRefresh} />
      <FreshnessIndicator lastUpdated={lastUpdated} onRefresh={handleRefresh} />
    </div>
  );
}

// ── Freshness Indicator ──
// Shows a subtle "updated X ago" badge; turns amber when stale (>5 min).

function FreshnessIndicator({
  lastUpdated,
  onRefresh,
}: {
  lastUpdated: number | null;
  onRefresh: () => void;
}) {
  const [, force] = useState(0);
  // Re-render every 60s so relative time stays fresh
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  if (lastUpdated === null) return null;
  const ageMs = Date.now() - lastUpdated;
  const ageMin = Math.floor(ageMs / 60000);
  const isStale = ageMin >= 5;
  const label = formatFreshness(ageMin);

  return (
    <button
      onClick={onRefresh}
      title={`数据更新于 ${label}（点击刷新）`}
      className={`absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium transition opacity-60 hover:opacity-100 ${
        isStale ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"
      }`}
    >
      <span className={`size-1 rounded-full ${isStale ? "bg-amber-500" : "bg-emerald-400"}`} />
      {label}
    </button>
  );
}

function formatFreshness(ageMin: number): string {
  if (ageMin < 1) return "刚刚";
  if (ageMin < 60) return `${ageMin}分钟前`;
  const hours = Math.floor(ageMin / 60);
  if (hours < 24) return `${hours}小时前`;
  return "较久前";
}

// ── Widget Content (dispatches by type) ──

function WidgetContent({
  widget,
  data,
  workspaceId,
  onRefresh,
}: {
  widget: WidgetDeclaration;
  data: WidgetDataResponse;
  workspaceId: string;
  onRefresh: () => void;
}) {
  switch (widget.type) {
    case "metric_card":
      return <MetricCardWidget widget={widget} data={data} workspaceId={workspaceId} />;
    case "trend_chart":
      return <TrendChartWidget widget={widget} data={data} />;
    case "breakdown":
      return <BreakdownWidget widget={widget} data={data} />;
    case "list":
      return <ListWidget widget={widget} data={data} workspaceId={workspaceId} />;
    case "activity_feed":
      return <ActivityFeedWidget widget={widget} data={data} />;
    default:
      return <WidgetError widget={widget} error={`Unknown widget type: ${widget.type}`} onRetry={onRefresh} />;
  }
}

// ── Metric Card Widget ──

function MetricCardWidget({
  widget,
  data,
  workspaceId,
}: {
  widget: WidgetDeclaration;
  data: WidgetDataResponse;
  workspaceId: string;
}) {
  const Icon = getIcon(widget.icon);
  const tone = getTone(widget.tone);
  const value = data.data.count ?? 0;
  const subLabel = data.sub?.label;

  const content = (
    <div className="app-card p-5 transition hover:shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`grid size-10 place-items-center rounded-lg ${tone}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="text-sm font-medium text-slate-700">{widget.label}</p>
      {subLabel && <p className="mt-1 text-xs text-slate-500">{subLabel}</p>}
    </div>
  );

  if (widget.link) {
    return <Link href={`/w/${workspaceId}${widget.link}`}>{content}</Link>;
  }
  return content;
}

// ── Trend Chart Widget ──

function TrendChartWidget({ widget, data }: { widget: WidgetDeclaration; data: WidgetDataResponse }) {
  const series = data.data.series ?? [];
  if (series.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="font-bold text-slate-900">{widget.label}</h3>
        <p className="mt-4 text-sm text-slate-400">暂无数据</p>
      </div>
    );
  }

  const maxValue = Math.max(...series.map((s) => s.count), 1);
  const barWidth = 100 / series.length;

  return (
    <div className="app-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          <TrendingUp size={18} className="text-indigo-600" />
          {widget.label}
        </h3>
      </div>
      <div className="relative h-40">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          {[25, 50, 75, 100].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#e2e8f0" strokeWidth="0.3" />
          ))}
          {series.map((s, i) => {
            const x = i * barWidth + barWidth * 0.15;
            const w = barWidth * 0.7;
            const h = (s.count / maxValue) * 100;
            return (
              <rect
                key={s.date}
                x={x}
                y={100 - h}
                width={w}
                height={h}
                fill="#6366f1"
                rx="0.3"
              />
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{series[0]?.date.slice(5)}</span>
        <span>{series[Math.floor(series.length / 2)]?.date.slice(5)}</span>
        <span>{series[series.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

// ── Breakdown Widget ──

function BreakdownWidget({ widget, data }: { widget: WidgetDeclaration; data: WidgetDataResponse }) {
  const groups = data.data.groups ?? [];
  const total = groups.reduce((sum, g) => sum + g.count, 0);

  if (total === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="font-bold text-slate-900">{widget.label}</h3>
        <p className="mt-4 text-sm text-slate-400">暂无数据</p>
      </div>
    );
  }

  const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
  const labelMap: Record<string, string> = {
    todo: "待办",
    in_progress: "进行中",
    done: "已完成",
    cancelled: "已取消",
    low: "低",
    medium: "中",
    high: "高",
    urgent: "紧急",
  };

  return (
    <div className="app-card p-5 sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
        <PieChart size={18} className="text-slate-600" />
        {widget.label}
      </h3>
      <div className="space-y-3">
        {groups.map((g, i) => {
          const pct = total > 0 ? (g.count / total) * 100 : 0;
          const color = colors[i % colors.length];
          const label = labelMap[g.key] ?? g.key;
          return (
            <div key={g.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: color }} />
                  {label}
                </span>
                <span className="font-medium text-slate-900">{g.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── List Widget ──

function ListWidget({
  widget,
  data,
  workspaceId,
}: {
  widget: WidgetDeclaration;
  data: WidgetDataResponse;
  workspaceId: string;
}) {
  const records = data.data.records ?? [];
  const columns = widget.data.columns ?? [];

  if (records.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="font-bold text-slate-900">{widget.label}</h3>
        <p className="mt-4 text-sm text-slate-400">暂无数据</p>
      </div>
    );
  }

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          <ListChecks size={18} className="text-slate-600" />
          {widget.label}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {columns.map((col) => (
                <th key={col} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record, i) => (
              <tr key={(record.id as string) ?? i} className="border-b border-slate-50 last:border-0">
                {columns.map((col) => (
                  <td key={col} className="px-4 py-2.5 text-slate-700">
                    {formatCellValue(record[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {widget.link && (
        <div className="border-t border-slate-100 px-5 py-3">
          <Link href={`/w/${workspaceId}${widget.link}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            查看全部 →
          </Link>
        </div>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

// ── Activity Feed Widget ──

function ActivityFeedWidget({ widget, data }: { widget: WidgetDeclaration; data: WidgetDataResponse }) {
  const events = data.data.events ?? [];

  if (events.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="font-bold text-slate-900">{widget.label}</h3>
        <p className="mt-4 text-sm text-slate-400">暂无活动</p>
      </div>
    );
  }

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          <Activity size={18} className="text-slate-600" />
          {widget.label}
        </h3>
      </div>
      <div className="divide-y divide-slate-50">
        {events.map((event) => {
          const { label, color } = translateAction(event.action);
          const entityName = getEntityName(event);
          return (
            <div key={event.id} className="flex items-start gap-3 px-5 py-3">
              <div className={`mt-1.5 size-2 shrink-0 rounded-full ${color.replace("text-", "bg-")}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700">
                  <span className={`font-medium ${color}`}>{label}</span>
                  {" "}
                  <span className="text-slate-600">{entityName}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatRelativeTime(event.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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

function getEntityName(event: {
  entityId: string;
  afterJson: string | null;
}): string {
  if (!event.afterJson) return event.entityId;
  try {
    const after = JSON.parse(event.afterJson);
    return after.name ?? after.title ?? after.label ?? event.entityId;
  } catch {
    return event.entityId;
  }
}

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

// ── Skeleton ──

function WidgetSkeleton({ widget }: { widget: WidgetDeclaration }) {
  return (
    <div className="app-card p-5">
      <div className="flex items-center gap-3">
        <div className="size-10 animate-pulse rounded-lg bg-slate-200" />
        <div className="flex-1">
          <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
      <div className="mt-4 h-8 w-16 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-100" />
      <p className="sr-only">{widget.label} 加载中</p>
    </div>
  );
}

// ── Error State ──

function WidgetError({
  widget,
  error,
  onRetry,
}: {
  widget: WidgetDeclaration;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="app-card p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-red-50">
          <AlertCircle size={20} className="text-red-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">{widget.label}</p>
          <p className="mt-0.5 text-xs text-red-600">{error}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        <RefreshCw size={12} />重试
      </button>
    </div>
  );
}

// ── Edit Mode Overlay ──

function EditModeOverlay({ widget }: { widget: WidgetDeclaration }) {
  return (
    <div className="absolute right-2 top-2 z-10 flex gap-1">
      <span className="rounded bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium text-white">
        {widget.key}
      </span>
    </div>
  );
}
