"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  RefreshCw,
  ScrollText,
  ExternalLink,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";

interface AuditSummaryEntry {
  summary: string;
  category: "workflow" | "automation" | "record" | "dashboard" | "admin" | "catalog" | "system";
  detail?: string;
  linkRoute?: string;
  linkLabel?: string;
}

interface AuditEventWithSummary {
  id: string;
  workspaceId: string;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  extensionVersionId: string | null;
  requestId: string | null;
  createdAt: string;
  summary: AuditSummaryEntry;
}

type FilterCategory = "all" | "workflow" | "automation" | "record" | "dashboard" | "admin" | "catalog" | "system";
type DateRange = "24h" | "7d" | "30d" | "all";

const CATEGORY_LABELS: Record<FilterCategory, string> = {
  all: "全部操作",
  workflow: "工作流",
  automation: "自动化",
  record: "记录变更",
  dashboard: "仪表盘",
  admin: "管理操作",
  catalog: "模块与 Pack",
  system: "系统",
};

const CATEGORY_COLORS: Record<FilterCategory, string> = {
  all: "bg-slate-100 text-slate-600",
  workflow: "bg-blue-100 text-blue-700",
  automation: "bg-purple-100 text-purple-700",
  record: "bg-emerald-100 text-emerald-700",
  dashboard: "bg-amber-100 text-amber-700",
  admin: "bg-indigo-100 text-indigo-700",
  catalog: "bg-cyan-100 text-cyan-700",
  system: "bg-slate-100 text-slate-500",
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  "24h": "最近 24 小时",
  "7d": "最近 7 天",
  "30d": "最近 30 天",
  all: "全部时间",
};

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString("zh-CN");
  } catch {
    return ts;
  }
}

export default function AuditPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const { t } = useI18n();

  const [events, setEvents] = useState<AuditEventWithSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [category, setCategory] = useState<FilterCategory>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadLogs = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateRange !== "all") params.set("range", dateRange);
      const res = await fetch(`/api/workspaces/${workspaceId}/audit?${params}`);
      const json = await res.json();
      if (json.success) setEvents(json.data);
      else setError(json.error?.message ?? t("workspace.loadFailed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, dateRange]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (category !== "all" && event.summary.category !== category) return false;
      return true;
    });
  }, [events, category]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ scope: "audit" }),
      });
      const json = await res.json();
      if (json.success) {
        const blob = new Blob([JSON.stringify(json.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        a.download = `audit-export-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setMessage("审计日志已导出");
      } else {
        setError(json.error?.message ?? "导出失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Audit</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">审计日志</h1>
          <p className="mt-1 text-sm text-slate-500">
            工作区内所有变更操作记录（共 {events.length} 条，筛选后 {filteredEvents.length} 条）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setLoading(true); void loadLogs(); }}
            className="app-button-secondary"
          >
            <RefreshCw size={16} />{t("workspace.refresh")}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="app-button-primary"
          >
            <Download size={16} />
            {exporting ? "导出中..." : "导出审计日志"}
          </button>
        </div>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}
      {message && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Filters */}
      <section className="app-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Filter size={14} />筛选
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">操作类型</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FilterCategory)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                {(Object.keys(CATEGORY_LABELS) as FilterCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">时间范围</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((d) => (
                  <option key={d} value={d}>{DATE_RANGE_LABELS[d]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      {filteredEvents.length === 0 ? (
        <div className="app-card p-8 text-center">
          <ScrollText size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {events.length === 0 ? "暂无审计日志" : "没有符合筛选条件的日志"}
          </p>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l border-slate-200 pl-6">
          {filteredEvents.map((event) => {
            const isExpanded = expandedId === event.id;
            const hasDetails = event.before || event.after;
            const cat = event.summary.category;
            return (
              <li key={event.id} className="relative">
                <span className="absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-indigo-500 bg-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                </span>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">
                          {event.summary.summary}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.system}`}>
                          {CATEGORY_LABELS[cat] ?? cat}
                        </span>
                      </div>
                      {event.summary.detail && (
                        <p className="mt-1 text-xs text-slate-500">{event.summary.detail}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                        <span>操作者：<span className="font-mono">{event.actorId}</span></span>
                        <span className="text-slate-300">·</span>
                        <span>{event.actorType}</span>
                        {event.summary.linkRoute && (
                          <>
                            <span className="text-slate-300">·</span>
                            <a
                              href={`/w/${workspaceId}${event.summary.linkRoute}`}
                              className="inline-flex items-center gap-0.5 text-indigo-600 hover:text-indigo-700"
                            >
                              {event.summary.linkLabel ?? "查看"}
                              <ExternalLink size={10} />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    <time className="shrink-0 text-xs text-slate-400">{formatTime(event.createdAt)}</time>
                  </div>
                  {hasDetails && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : event.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {isExpanded ? "收起原始数据" : "查看原始数据"}
                      </button>
                      {isExpanded && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {event.before && (
                            <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">变更前</p>
                              <pre className="overflow-x-auto text-[11px] text-slate-600">
                                {JSON.stringify(event.before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {event.after && (
                            <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">变更后</p>
                              <pre className="overflow-x-auto text-[11px] text-slate-600">
                                {JSON.stringify(event.after, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
