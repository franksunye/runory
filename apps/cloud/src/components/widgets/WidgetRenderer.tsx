"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Activity, AlertCircle, CheckCircle2, Clock, ListChecks,
  PieChart, RefreshCw, TrendingUp, Users,
} from "lucide-react";
import type { WidgetDeclaration } from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { formatRelativeTime } from "../SchemaTable";

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
  /** When provided, the widget runs in batch mode and uses pre-fetched data. */
  batchData?: WidgetDataResponse | null;
  /** Error message from a batch fetch. */
  batchError?: string | null;
  /** Whether a batch fetch is in progress. */
  batchLoading?: boolean;
  /** Refresh handler for batch mode (re-fetches all widgets). */
  onRefreshAll?: () => void;
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

// ── Label key maps ──

const BREAKDOWN_LABEL_KEY: Record<string, MessageKey> = {
  todo: "workspace.table.statusTodo",
  in_progress: "workspace.table.statusInProgress",
  done: "workspace.table.statusDone",
  cancelled: "workspace.table.statusCancelled",
  low: "workspace.table.priorityLow",
  medium: "workspace.table.priorityMedium",
  high: "workspace.table.priorityHigh",
  urgent: "workspace.table.priorityUrgent",
};

const ACTION_LABEL_KEY: Record<string, MessageKey> = {
  "record.create": "widget.action.recordCreate",
  "record.update": "widget.action.recordUpdate",
  "record.delete": "widget.action.recordDelete",
  "extension.apply": "widget.action.extensionApply",
  "extension.rollback": "widget.action.extensionRollback",
  "api_key.create": "widget.action.apiKeyCreate",
  "api_key.revoke": "widget.action.apiKeyRevoke",
};

const ACTION_FALLBACK_LABEL: Record<string, string> = {
  "form_submission.submit": "Submitted form",
  "form_submission.accept": "Accepted form",
  "form_submission.return": "Returned form",
  "automation.create": "Created automation",
  "workflow.start": "Started workflow",
  "workflow.complete": "Completed workflow",
  "work_item.create": "Created work item",
  "work_item.complete": "Completed work item",
};

type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

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
  batchData,
  batchError,
  batchLoading,
  onRefreshAll,
}: WidgetRendererProps) {
  const { t } = useI18n();
  const isBatchMode = batchLoading !== undefined;
  const [data, setData] = useState<WidgetDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const prevBatchDataRef = useRef<WidgetDataResponse | null | undefined>(undefined);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ instance, zone });
      const res = await fetch(
        `/api/workspaces/${workspaceId}/widgets/${moduleId}/${widgetKey}?${params}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.loadFailed"));
      setData(json.data);
      setError(null);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, moduleId, widgetKey, instance, zone, t]);

  // Standalone mode: fetch on mount.
  useEffect(() => {
    if (isBatchMode) return;
    void loadData();
  }, [loadData, isBatchMode]);

  // Batch mode: track lastUpdated when data changes.
  useEffect(() => {
    if (!isBatchMode) return;
    if (prevBatchDataRef.current !== batchData) {
      prevBatchDataRef.current = batchData;
      if (batchData) setLastUpdated(Date.now());
    }
  }, [batchData, isBatchMode]);

  const handleRefresh = () => {
    if (isBatchMode) {
      onRefreshAll?.();
      return;
    }
    setLoading(true);
    void loadData();
    onRefresh?.();
  };

  if (isBatchMode) {
    if (batchError && !batchData) return <WidgetError widget={widget} error={batchError} onRetry={handleRefresh} />;
    if (batchLoading && !batchData) return <WidgetSkeleton widget={widget} />;
    if (!batchData) return null;
    return (
      <div className="relative">
        {editMode && <EditModeOverlay widget={widget} />}
        {batchError && (
          <div className="absolute right-2 top-2 z-10 rounded bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
            {batchError}
          </div>
        )}
        <WidgetContent widget={batchData.widget} data={batchData} workspaceId={workspaceId} onRefresh={handleRefresh} />
        <FreshnessIndicator lastUpdated={lastUpdated} onRefresh={handleRefresh} />
      </div>
    );
  }

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

function formatFreshness(ageMin: number, t: TFunc): string {
  if (ageMin < 1) return t("workspace.table.justNow");
  if (ageMin < 60) return t("workspace.table.minutesAgo", { min: ageMin });
  const hours = Math.floor(ageMin / 60);
  if (hours < 24) return t("workspace.table.hoursAgo", { hr: hours });
  return t("widget.freshnessLongAgo");
}

function FreshnessIndicator({
  lastUpdated,
  onRefresh,
}: {
  lastUpdated: number | null;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [, force] = useState(0);
  // Re-render every 60s so relative time stays fresh
  useEffect(() => {
    const timer = setInterval(() => force((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  if (lastUpdated === null) return null;
  const ageMs = Date.now() - lastUpdated;
  const ageMin = Math.floor(ageMs / 60000);
  const isStale = ageMin >= 5;
  const label = formatFreshness(ageMin, t);

  return (
    <button
      onClick={onRefresh}
      title={t("widget.freshnessUpdated", { label })}
      className={`absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium transition opacity-60 hover:opacity-100 ${
        isStale ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"
      }`}
    >
      <span className={`size-1 rounded-full ${isStale ? "bg-amber-500" : "bg-emerald-400"}`} />
      {label}
    </button>
  );
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
  const { t } = useI18n();
  const series = data.data.series ?? [];
  if (series.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="font-bold text-slate-900">{widget.label}</h3>
        <p className="mt-4 text-sm text-slate-400">{t("workspace.table.noData")}</p>
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
  const { t } = useI18n();
  const groups = data.data.groups ?? [];
  const total = groups.reduce((sum, g) => sum + g.count, 0);

  if (total === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="font-bold text-slate-900">{widget.label}</h3>
        <p className="mt-4 text-sm text-slate-400">{t("workspace.table.noData")}</p>
      </div>
    );
  }

  const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

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
          const key = BREAKDOWN_LABEL_KEY[g.key];
          const label = key ? t(key) : g.key;
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

function formatCellValue(value: unknown, t: TFunc): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? t("workspace.yes") : t("workspace.no");
  return String(value);
}

function ListWidget({
  widget,
  data,
  workspaceId,
}: {
  widget: WidgetDeclaration;
  data: WidgetDataResponse;
  workspaceId: string;
}) {
  const { t } = useI18n();
  const records = data.data.records ?? [];
  const columns = widget.data.columns ?? [];

  if (records.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="font-bold text-slate-900">{widget.label}</h3>
        <p className="mt-4 text-sm text-slate-400">{t("workspace.table.noData")}</p>
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
                    {formatCellValue(record[col], t)}
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
            {t("widget.viewAll")} →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Activity Feed Widget ──

function translateAction(action: string, t: TFunc): { label: string; color: string } {
  const colorMap: Record<string, string> = {
    "record.create": "text-emerald-600",
    "record.update": "text-blue-600",
    "record.delete": "text-red-600",
    "extension.apply": "text-violet-600",
    "extension.rollback": "text-orange-600",
    "api_key.create": "text-slate-600",
    "api_key.revoke": "text-slate-600",
    "form_submission.submit": "text-purple-600",
    "form_submission.accept": "text-emerald-600",
    "form_submission.return": "text-amber-600",
    "automation.create": "text-blue-600",
    "workflow.start": "text-indigo-600",
    "workflow.complete": "text-emerald-600",
    "work_item.create": "text-cyan-600",
    "work_item.complete": "text-emerald-600",
  };
  const key = ACTION_LABEL_KEY[action];
  return key
    ? { label: t(key), color: colorMap[action] ?? "text-slate-600" }
    : { label: ACTION_FALLBACK_LABEL[action] ?? humanizeToken(action), color: colorMap[action] ?? "text-slate-600" };
}

function ActivityFeedWidget({ widget, data }: { widget: WidgetDeclaration; data: WidgetDataResponse }) {
  const { t } = useI18n();
  const events = data.data.events ?? [];

  if (events.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="font-bold text-slate-900">{widget.label}</h3>
        <p className="mt-4 text-sm text-slate-400">{t("widget.noActivity")}</p>
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
          const { label, color } = translateAction(event.action, t);
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
                  {formatRelativeTime(event.createdAt, t)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getEntityName(event: {
  action?: string;
  entityType?: string;
  entityId: string;
  afterJson: string | null;
}): string {
  const generic = humanizeToken(event.entityType ?? "business event");
  if (!event.afterJson) return generic;
  try {
    const after = JSON.parse(event.afterJson);
    if (after.name || after.title || after.label) return after.name ?? after.title ?? after.label;
    if (after.subject_type) return `${humanizeToken(after.subject_type)} form`;
    if (after.form_definition_id) return "Form submission";
    if (after.return_reason) return "Revision requested";
    if (event.action?.startsWith("form_submission.")) return "Form submission";
    return generic;
  } catch {
    return generic;
  }
}

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

// ── Skeleton ──

function WidgetSkeleton({ widget }: { widget: WidgetDeclaration }) {
  const { t } = useI18n();
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
      <p className="sr-only">{t("widget.loading", { label: widget.label })}</p>
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
  const { t } = useI18n();
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
        <RefreshCw size={12} />{t("workspace.retry")}
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
