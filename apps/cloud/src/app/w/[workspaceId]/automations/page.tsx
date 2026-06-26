"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Zap, Plus, RefreshCw, Play, Eye, Trash2, ToggleLeft, ToggleRight,
  AlertCircle, Loader2, Pencil, ChevronDown, ChevronUp,
} from "lucide-react";
import type {
  AutomationTrigger, AutomationAction,
} from "@runory/contracts";
import type {
  AutomationDefinitionInfo, AutomationRun, DryRunResult,
} from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

interface Toast { type: "success" | "error"; message: string }

type TriggerType = AutomationTrigger["type"];
type ActionType = AutomationAction["type"];

const TRIGGER_LABEL_KEYS: Record<TriggerType, MessageKey> = {
  record_created: "automations.trigger.record_created", record_updated: "automations.trigger.record_updated", record_field_changed: "automations.trigger.record_field_changed",
  schedule: "automations.trigger.schedule", manual: "automations.trigger.manual",
};
const ACTION_LABEL_KEYS: Record<ActionType, MessageKey> = {
  create_task: "automations.action.create_task", update_record: "automations.action.update_record", send_notification: "automations.action.send_notification",
  transition_workflow: "automations.action.transition_workflow", set_field: "automations.action.set_field",
};
const RUN_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  success: "automations.runStatus.success", failed: "automations.runStatus.failed", skipped: "automations.runStatus.skipped", dry_run: "automations.runStatus.dry_run",
};

function runStatusBadgeClass(status: string): string {
  if (status === "success") return "bg-emerald-50 text-emerald-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "skipped") return "bg-amber-50 text-amber-700";
  if (status === "dry_run") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("zh-CN", { hour12: false }); }
  catch { return iso; }
}

export default function AutomationsPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const { t } = useI18n();
  const [automations, setAutomations] = useState<AutomationDefinitionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/workspaces/${workspaceId}/automations`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.loadFailed"));
      setAutomations(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async (auto: AutomationDefinitionInfo, enabled: boolean) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("automations.toggleFailed"));
      setAutomations(list => list.map(a => a.automationId === auto.automationId ? { ...a, enabled } : a));
      showToast("success", enabled ? t("automations.enabled") : t("automations.disabled"));
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.toggleFailed"));
    }
  };

  const handleDelete = async (auto: AutomationDefinitionInfo) => {
    if (!confirm(t("automations.deleteConfirm", { name: auto.name }))) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("workspace.deleteFailed"));
      showToast("success", t("automations.deleted", { name: auto.name }));
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("workspace.deleteFailed"));
    }
  };

  if (loading) return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Automation runtime</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("automations.title")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("automations.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button onClick={() => void load()} className="app-button-secondary"><RefreshCw size={16} />{t("workspace.refresh")}</button>
          <button onClick={() => router.push(`/w/${workspaceId}/automations/editor`)} className="app-button-primary"><Plus size={16} />{t("automations.createAutomation")}</button>
        </div>
      </header>

      {error && (
        <div className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {toast.message}
        </div>
      )}

      <section className="app-card p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900">{t("automations.list")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("automations.listMeta", { count: automations.length })}</p>
        </div>
        {automations.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Zap size={32} className="text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">{t("automations.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {automations.map(auto => (
              <AutomationCard
                key={auto.automationId}
                auto={auto}
                workspaceId={workspaceId}
                expanded={expandedId === auto.automationId}
                onToggleExpand={() => setExpandedId(prev => prev === auto.automationId ? null : auto.automationId)}
                onToggle={(en) => handleToggle(auto, en)}
                onEdit={() => router.push(`/w/${workspaceId}/automations/editor?id=${auto.automationId}`)}
                onDelete={() => handleDelete(auto)}
                showToast={showToast}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Automation Card (with dry run + run history) ──

interface AutomationCardProps {
  auto: AutomationDefinitionInfo;
  workspaceId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  showToast: (type: Toast["type"], message: string) => void;
}

function AutomationCard({ auto, workspaceId, expanded, onToggleExpand, onToggle, onEdit, onDelete, showToast }: AutomationCardProps) {
  const { t } = useI18n();
  const def = auto.definition;
  const [dryResult, setDryResult] = useState<DryRunResult | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadedRuns, setLoadedRuns] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}/run?limit=10`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("automations.loadHistoryFailed"));
      setRuns(json.data);
      setLoadedRuns(true);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.loadHistoryFailed"));
    }
  }, [workspaceId, auto.automationId, showToast, t]);

  useEffect(() => {
    if (expanded && !loadedRuns) void loadRuns();
  }, [expanded, loadedRuns, loadRuns]);

  const handleDryRun = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true, triggerPayload: {} }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("automations.dryRunFailed"));
      setDryResult(json.data);
      showToast("success", t("automations.dryRunCompleted"));
      await loadRuns();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.dryRunFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleRunNow = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/automations/${auto.automationId}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, triggerType: "manual" }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? t("automations.runFailed"));
      showToast("success", t("automations.runTriggered"));
      await loadRuns();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : t("automations.runFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Zap size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{def.name}</p>
          <p className="truncate text-xs text-slate-500">
            {def.description ? `${def.description} · ` : ""}{t("automations.triggerPrefix", { label: t(TRIGGER_LABEL_KEYS[def.trigger.type]) })}
            {def.trigger.targetObject ? ` · ${def.trigger.targetObject}` : ""}
            {def.trigger.fieldKey ? `.${def.trigger.fieldKey}` : ""}
            {def.trigger.cron ? ` · ${def.trigger.cron}` : ""}
            {" · "}{t("automations.actionsCount", { count: def.actions.length })}
          </p>
        </div>
        {auto.lastRunStatus && (
          <span className={`app-badge ${runStatusBadgeClass(auto.lastRunStatus)}`}>{RUN_STATUS_LABEL_KEYS[auto.lastRunStatus] ? t(RUN_STATUS_LABEL_KEYS[auto.lastRunStatus]) : auto.lastRunStatus}</span>
        )}
        <span className="app-badge bg-slate-100 text-slate-600">{formatTime(auto.lastRunAt)}</span>
        <button onClick={() => onToggle(!auto.enabled)} className="text-slate-500 hover:text-indigo-600" title={auto.enabled ? t("automations.enabled") : t("automations.disabled")}>
          {auto.enabled ? <ToggleRight size={22} className="text-emerald-600" /> : <ToggleLeft size={22} />}
        </button>
        <button onClick={onEdit} className="app-button-secondary"><Pencil size={14} />{t("workspace.edit")}</button>
        <button onClick={onDelete} className="text-slate-400 hover:text-red-600" title={t("workspace.delete")}><Trash2 size={16} /></button>
        <button onClick={onToggleExpand} className="text-slate-400 hover:text-slate-600" title={expanded ? t("automations.collapse") : t("automations.expand")}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-4 pl-12">
          <div className="flex flex-wrap gap-2">
            <button onClick={handleDryRun} className="app-button-secondary" disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}{t("automations.dryRun")}
            </button>
            <button onClick={handleRunNow} className="app-button-primary" disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{t("automations.runNow")}
            </button>
          </div>

          {dryResult && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <p className="text-xs font-bold text-slate-700">{t("automations.dryRunResult")}</p>
              <p className="mt-1 text-xs text-slate-600">
                {t("automations.wouldFire")}{" "}
                <span className={dryResult.wouldFire ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                  {dryResult.wouldFire ? t("workspace.yes") : t("workspace.no")}
                </span>
                {dryResult.reason ? ` · ${dryResult.reason}` : ""}
              </p>
              {dryResult.actionsPreview.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {dryResult.actionsPreview.map((a, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <span className="app-badge bg-slate-100 text-slate-600 mr-1">{ACTION_LABEL_KEYS[a.actionType as ActionType] ? t(ACTION_LABEL_KEYS[a.actionType as ActionType]) : a.actionType}</span>
                      {a.description}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">{t("automations.recentRuns")}</p>
            {runs.length === 0 ? (
              <p className="text-xs text-slate-400">{t("automations.noRuns")}</p>
            ) : (
              <ul className="space-y-1.5">
                {runs.map(run => (
                  <li key={run.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className={`app-badge ${runStatusBadgeClass(run.status)}`}>{RUN_STATUS_LABEL_KEYS[run.status] ? t(RUN_STATUS_LABEL_KEYS[run.status]) : run.status}</span>
                    <span>{formatTime(run.startedAt)}</span>
                    <span className="text-slate-400">· {run.triggerType}</span>
                    {run.actionsTaken.length > 0 && <span className="text-slate-400">{t("automations.runActionsCount", { count: run.actionsTaken.length })}</span>}
                    {run.errorMessage && <span className="text-red-600">· {run.errorMessage}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
