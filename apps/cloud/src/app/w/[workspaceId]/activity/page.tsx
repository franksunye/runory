"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { AuditLog } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";

type EventCategory = "create" | "update" | "delete" | "extension" | "system";

const CATEGORY_STYLES: Record<EventCategory, { dot: string; ring: string; badge: string; label: string }> = {
  create: { dot: "bg-emerald-500", ring: "border-emerald-300", badge: "bg-emerald-50 text-emerald-700", label: "创建" },
  update: { dot: "bg-blue-500", ring: "border-blue-300", badge: "bg-blue-50 text-blue-700", label: "更新" },
  delete: { dot: "bg-red-500", ring: "border-red-300", badge: "bg-red-50 text-red-700", label: "删除" },
  extension: { dot: "bg-purple-500", ring: "border-purple-300", badge: "bg-purple-50 text-purple-700", label: "扩展" },
  system: { dot: "bg-slate-400", ring: "border-slate-300", badge: "bg-slate-100 text-slate-600", label: "系统" },
};

const BUSINESS_LABELS: Record<string, string> = {
  "extension.apply": "应用了一项工作区扩展",
  "extension.rollback": "回滚了工作区扩展",
  "pack.install": "安装了业务 Pack",
  "record.create": "创建了新记录",
  "record.update": "更新了记录",
  "record.delete": "删除了记录",
};

const ENTITY_LABELS: Record<string, string> = {
  record: "记录",
  extension: "扩展",
  pack: "业务包",
  module: "模块",
  workflow: "工作流",
};

const ACTOR_LABELS: Record<string, string> = {
  user: "成员",
  agent: "Agent",
  system: "系统",
};

const PAGE_SIZE = 20;

function categorize(action: string): EventCategory {
  if (action.startsWith("record.create") || action.startsWith("pack.install")) return "create";
  if (action.startsWith("record.update")) return "update";
  if (action.startsWith("record.delete") || action.startsWith("pack.uninstall")) return "delete";
  if (action.startsWith("extension.")) return "extension";
  return "system";
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString("zh-CN");
  } catch {
    return ts;
  }
}

function summarizeEntity(log: AuditLog): string {
  const entityLabel = ENTITY_LABELS[log.entityType] ?? log.entityType;
  const after = log.after;
  if (after && typeof after === "object") {
    const name = (after as Record<string, unknown>).name;
    if (typeof name === "string" && name) return `${entityLabel}：${name}`;
    const version = (after as Record<string, unknown>).version;
    if (version !== undefined) return `${entityLabel} · 版本 #${version}`;
  }
  return `${entityLabel} · ${log.entityId.slice(0, 8)}`;
}

export default function ActivityPage() {
  const workspaceId = useParams().workspaceId as string;
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/workspaces/${workspaceId}/audit`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
      } else {
        setError(json.error?.message ?? t("workspace.loadFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  const visible = logs.slice(0, visibleCount);
  const hasMore = visibleCount < logs.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Activity</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">活动</h1>
          <p className="mt-2 text-sm text-slate-500">工作区内最近的业务变更与操作动态（共 {logs.length} 条）</p>
        </div>
        <button onClick={() => { setLoading(true); setVisibleCount(PAGE_SIZE); void load(); }} className="app-button-secondary self-start">
          <RefreshCw size={16} />{t("workspace.refresh")}
        </button>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}

      {logs.length === 0 ? (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <p className="text-sm text-slate-500">暂无活动记录</p>
        </div>
      ) : (
        <>
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {visible.map((log) => {
              const category = categorize(log.action);
              const style = CATEGORY_STYLES[category];
              const description = BUSINESS_LABELS[log.action] ?? log.action;
              const actorLabel = ACTOR_LABELS[log.actorType] ?? log.actorType;
              return (
                <li key={log.id} className="relative">
                  <span className={`absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${style.ring} bg-white`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  </span>
                  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`app-badge ${style.badge}`}>{style.label}</span>
                        <span className="text-sm font-semibold text-slate-800">{description}</span>
                      </div>
                      <time className="shrink-0 text-xs text-slate-400">{formatTime(log.createdAt)}</time>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{actorLabel}</span>
                      <span className="font-mono text-[11px] text-slate-400">{log.actorId}</span>
                      <span className="text-slate-300">·</span>
                      <span>{summarizeEntity(log)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="app-button-secondary"
              >
                加载更多（剩余 {logs.length - visibleCount} 条）
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
