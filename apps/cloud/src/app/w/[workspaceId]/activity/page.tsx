"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { AuditLog } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch } from "@/lib/api-fetch";

type EventCategory = "create" | "update" | "delete" | "extension" | "system" | "workflow" | "form_submission" | "work_item" | "command";

const CATEGORY_STYLES: Record<EventCategory, { dot: string; ring: string; badge: string; labelKey: MessageKey }> = {
  create: { dot: "bg-emerald-500", ring: "border-emerald-300", badge: "bg-emerald-50 text-emerald-700", labelKey: "activity.categoryCreate" },
  update: { dot: "bg-blue-500", ring: "border-blue-300", badge: "bg-blue-50 text-blue-700", labelKey: "activity.categoryUpdate" },
  delete: { dot: "bg-red-500", ring: "border-red-300", badge: "bg-red-50 text-red-700", labelKey: "activity.categoryDelete" },
  extension: { dot: "bg-purple-500", ring: "border-purple-300", badge: "bg-purple-50 text-purple-700", labelKey: "activity.categoryExtension" },
  system: { dot: "bg-slate-400", ring: "border-slate-300", badge: "bg-slate-100 text-slate-600", labelKey: "activity.categorySystem" },
  workflow: { dot: "bg-indigo-500", ring: "border-indigo-300", badge: "bg-indigo-50 text-indigo-700", labelKey: "activity.categoryWorkflow" },
  form_submission: { dot: "bg-fuchsia-500", ring: "border-fuchsia-300", badge: "bg-fuchsia-50 text-fuchsia-700", labelKey: "activity.categoryFormSubmission" },
  work_item: { dot: "bg-cyan-500", ring: "border-cyan-300", badge: "bg-cyan-50 text-cyan-700", labelKey: "activity.categoryWorkItem" },
  command: { dot: "bg-amber-500", ring: "border-amber-300", badge: "bg-amber-50 text-amber-700", labelKey: "activity.categoryCommand" },
};

const BUSINESS_LABELS: Record<string, MessageKey> = {
  "extension.apply": "activity.action.extensionApply",
  "extension.rollback": "activity.action.extensionRollback",
  "pack.install": "activity.action.packInstall",
  "record.create": "activity.action.recordCreate",
  "record.update": "activity.action.recordUpdate",
  "record.delete": "activity.action.recordDelete",
  // v0.5 workflow / forms / work items / commands (category-level labels)
  "workflow": "activity.categoryWorkflow",
  "form_submission": "activity.categoryFormSubmission",
  "work_item": "activity.categoryWorkItem",
  "command": "activity.categoryCommand",
};

const ENTITY_LABELS: Record<string, MessageKey> = {
  record: "activity.entity.record",
  extension: "activity.entity.extension",
  pack: "activity.entity.pack",
  module: "activity.entity.module",
  workflow: "activity.entity.workflow",
};

const ACTOR_LABELS: Record<string, MessageKey> = {
  user: "activity.actor.user",
  agent: "activity.actor.agent",
  system: "activity.actor.system",
};

const PAGE_SIZE = 20;

function categorize(action: string): EventCategory {
  if (action.startsWith("record.create") || action.startsWith("pack.install")) return "create";
  if (action.startsWith("record.update")) return "update";
  if (action.startsWith("record.delete") || action.startsWith("pack.uninstall")) return "delete";
  if (action.startsWith("extension.")) return "extension";
  // v0.5 workflow / forms / work items / commands
  if (action.startsWith("workflow")) return "workflow";
  if (action.startsWith("form_submission")) return "form_submission";
  if (action.startsWith("work_item")) return "work_item";
  if (action === "command" || action.startsWith("command.")) return "command";
  return "system";
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString("zh-CN");
  } catch {
    return ts;
  }
}

function summarizeEntity(
  log: AuditLog,
  t: (key: MessageKey, params?: Record<string, string | number>) => string
): string {
  const entityKey = ENTITY_LABELS[log.entityType];
  const entityLabel = entityKey ? t(entityKey) : log.entityType;
  const after = log.after;
  if (after && typeof after === "object") {
    const name = (after as Record<string, unknown>).name;
    if (typeof name === "string" && name) return t("activity.entityWithName", { label: entityLabel, name });
    const version = (after as Record<string, unknown>).version;
    if (version !== undefined) return t("activity.entityWithVersion", { label: entityLabel, version: String(version) });
  }
  return t("activity.entityWithId", { label: entityLabel, id: log.entityId.slice(0, 8) });
}

export default function ActivityPage() {
  const workspaceId = useParams().workspaceId as string;
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filterCategory, setFilterCategory] = useState<EventCategory | "all">("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      const json = await apiFetch<{
        success: boolean;
        data: AuditLog[];
        error?: { message: string };
      }>(`/api/workspaces/${workspaceId}/audit`);
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

  const filtered = filterCategory === "all"
    ? logs
    : logs.filter((l) => categorize(l.action) === filterCategory);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Activity</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("activity.title")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("activity.subtitle", { count: logs.length })}</p>
        </div>
        <button onClick={() => { setLoading(true); setVisibleCount(PAGE_SIZE); void load(); }} className="app-button-secondary self-start">
          <RefreshCw size={16} />{t("workspace.refresh")}
        </button>
      </header>

      {/* Category filter */}
      {logs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">{t("activity.filterCategory")}</label>
          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value as EventCategory | "all"); setVisibleCount(PAGE_SIZE); }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500"
          >
            <option value="all">{t("activity.filterAll")}</option>
            {(Object.keys(CATEGORY_STYLES) as EventCategory[]).map((cat) => (
              <option key={cat} value={cat}>{t(CATEGORY_STYLES[cat].labelKey)}</option>
            ))}
          </select>
        </div>
      )}

      {error && <div role="alert" className="app-error">{error}</div>}

      {logs.length === 0 ? (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <p className="text-sm text-slate-500">{t("activity.empty")}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="app-card flex flex-col items-center p-10 text-center">
          <p className="text-sm text-slate-500">{t("workspace.noResults")}</p>
        </div>
      ) : (
        <>
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {visible.map((log) => {
              const category = categorize(log.action);
              const style = CATEGORY_STYLES[category];
              const descriptionKey = BUSINESS_LABELS[log.action];
              const description = descriptionKey ? t(descriptionKey) : log.action;
              const actorKey = ACTOR_LABELS[log.actorType];
              const actorLabel = actorKey ? t(actorKey) : log.actorType;
              return (
                <li key={log.id} className="relative">
                  <span className={`absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${style.ring} bg-white`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  </span>
                  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`app-badge ${style.badge}`}>{t(style.labelKey)}</span>
                        <span className="text-sm font-semibold text-slate-800">{description}</span>
                      </div>
                      <time className="shrink-0 text-xs text-slate-400">{formatTime(log.createdAt)}</time>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{actorLabel}</span>
                      <span className="font-mono text-[11px] text-slate-400">{log.actorId}</span>
                      <span className="text-slate-300">·</span>
                      <span>{summarizeEntity(log, t)}</span>
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
                {t("activity.loadMore", { remaining: filtered.length - visibleCount })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
