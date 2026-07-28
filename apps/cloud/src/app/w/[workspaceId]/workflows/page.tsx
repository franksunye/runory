"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus, RefreshCw, AlertCircle, Loader2,
  Workflow, Pencil, ChevronRight,
} from "lucide-react";
import type {
  WorkflowDefinition, WorkflowStep, WorkflowOverview,
} from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch } from "@/lib/api-fetch";
import { WorkflowFlowDiagram } from "@/components/workflow/WorkflowFlowDiagram";

// ── Types ──

/** API response shape for a definition row (from definitions endpoint). */
interface DefinitionDetail {
  id: string;
  workspaceId: string;
  workflowKey: string;
  name: string;
  targetObject: string;
  status: string;
  versionNumber: number;
  definition: WorkflowDefinition | null;
  overview: WorkflowOverview | null;
  createdAt: string;
  updatedAt: string;
}

// ── Constants & Helpers ──

function v2StatusBadgeClass(status: string): string {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "running") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

// ── Page ──

export default function WorkflowsPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const { t } = useI18n();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Step workflows</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("workflow.pageTitle")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("workflow.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button onClick={() => setRefreshKey((k) => k + 1)} className="app-button-secondary"><RefreshCw size={16} />{t("workspace.refresh")}</button>
          <button onClick={() => router.push(`/w/${workspaceId}/workflows/editor`)} className="app-button-primary"><Plus size={16} />{t("workflow.createWorkflow")}</button>
        </div>
      </header>

      <DefinitionsSection workspaceId={workspaceId} refreshKey={refreshKey} />
    </div>
  );
}

// ── Workflow Definitions Section ──

function DefinitionsSection({ workspaceId, refreshKey }: { workspaceId: string; refreshKey: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [definitions, setDefinitions] = useState<DefinitionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const json = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: DefinitionDetail[];
      }>(
        `/api/workspaces/${workspaceId}/workflows/definitions`,
        { cache: "no-store" }
      );
      if (!json.success) {
        throw new Error(json.error?.message ?? t("workflow.loadFailed"));
      }
      setDefinitions(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workflow.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="app-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <Workflow size={16} className="text-indigo-600" />
            {t("workflow.definitions")}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{t("workflow.definitionsHint")}</p>
        </div>
        <button onClick={() => void load()} className="app-button-secondary" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {loading && definitions.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflow.loadingDefinitions")}</p>
      ) : error ? (
        <div className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflow.noDefinitions")}</p>
      ) : (
        <ul className="space-y-4">
          {definitions.map((def) => {
            const steps: WorkflowStep[] = def.definition?.steps ?? [];
            return (
              <li key={def.id} className="rounded-lg border border-slate-100 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Workflow size={17} />
                  </span>
                  <button
                    onClick={() => router.push(`/w/${workspaceId}/workflows/${def.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-semibold text-slate-800 hover:text-indigo-600">
                      {def.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {t("workflow.workflowKey")}: <span className="font-mono">{def.workflowKey}</span>
                      {" · "}{t("workflow.targetObject")}: <span className="font-mono">{def.targetObject}</span>
                      {" · v"}{def.versionNumber}
                    </p>
                  </button>
                  <span className={`app-badge ${v2StatusBadgeClass(def.status === "active" ? "running" : def.status)}`}>
                    {def.status}
                  </span>
                  <button
                    onClick={() => router.push(`/w/${workspaceId}/workflows/${def.id}`)}
                    className="app-button-secondary"
                    title={t("workflow.viewDetail")}
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    onClick={() => router.push(`/w/${workspaceId}/workflows/editor?edit=${encodeURIComponent(def.workflowKey)}`)}
                    className="app-button-secondary"
                    title={t("workspace.edit")}
                  >
                    <Pencil size={14} />{t("workspace.edit")}
                  </button>
                </div>

                {/* Visual step flow with overview labels and branch indicators */}
                {def.definition && steps.length > 0 && (
                  <div className="mt-3 pl-12">
                    <p className="mb-1.5 text-xs font-semibold text-slate-500">{t("workflow.stepPipeline")}</p>
                    <WorkflowFlowDiagram definition={def.definition} overview={def.overview} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
