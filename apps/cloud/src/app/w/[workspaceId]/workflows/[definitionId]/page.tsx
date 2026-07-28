"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, RefreshCw, AlertCircle, Loader2,
  Workflow, Pencil, Layers, ExternalLink, ChevronRight,
} from "lucide-react";
import type {
  WorkflowDefinition, WorkflowStep, WorkflowOverview, WorkflowRunProjection,
} from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch } from "@/lib/api-fetch";
import { objectKeyToRouteSegment } from "@/lib/route-conversion";
import { WorkflowFlowDiagram } from "@/components/workflow/WorkflowFlowDiagram";
import WorkflowRunTimeline from "@/components/workflow/WorkflowRunTimeline";

// ── Types ──

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

interface InstanceDetail {
  id: string;
  workflow_definition_id: string;
  object_type: string;
  record_id: string;
  status: string;
  current_step_id: string | null;
  version: number;
  started_at: string;
  completed_at: string | null;
  work_items: WorkItemRow[];
  definition: WorkflowDefinition | null;
  runProjection: WorkflowRunProjection | null;
  definitionName: string | null;
  definitionWorkflowKey: string | null;
}

interface WorkItemRow {
  id: string;
  instance_id: string;
  step_id: string;
  kind: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
}

// ── Constants & Helpers ──

function v2StatusBadgeClass(status: string): string {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "running") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

// ── Page ──

export default function WorkflowDefinitionDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const definitionId = params.definitionId as string;
  const router = useRouter();
  const { t } = useI18n();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-3">
        <button
          onClick={() => router.push(`/w/${workspaceId}/workflows`)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={15} />
          {t("workflow.editorBack")}
        </button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="app-eyebrow">Step workflows</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">
              {t("workflow.definitionDetail")}
            </h1>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button onClick={() => setRefreshKey((k) => k + 1)} className="app-button-secondary"><RefreshCw size={16} />{t("workspace.refresh")}</button>
          </div>
        </div>
      </header>

      <DefinitionSection
        workspaceId={workspaceId}
        definitionId={definitionId}
        refreshKey={refreshKey}
      />
      <InstancesSection
        workspaceId={workspaceId}
        definitionId={definitionId}
        refreshKey={refreshKey}
      />
    </div>
  );
}

// ── Definition Section ──

function DefinitionSection({
  workspaceId, definitionId, refreshKey,
}: { workspaceId: string; definitionId: string; refreshKey: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [def, setDef] = useState<DefinitionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch all definitions and find by ID — no single-definition endpoint exists.
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
      const found = (json.data ?? []).find((d) => d.id === definitionId);
      if (!found) {
        throw new Error(t("workflow.definitionNotFound"));
      }
      setDef(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workflow.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, definitionId, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <section className="app-card p-5 sm:p-6">
        <Loader2 size={18} className="animate-spin text-slate-400" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="app-card p-5 sm:p-6">
        <div className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!def) return null;

  const steps: WorkflowStep[] = def.definition?.steps ?? [];

  return (
    <section className="app-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
            <Workflow size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{def.name}</h2>
            <p className="text-xs text-slate-500">
              {t("workflow.workflowKey")}: <span className="font-mono">{def.workflowKey}</span>
              {" · "}{t("workflow.targetObject")}: <span className="font-mono">{def.targetObject}</span>
              {" · v"}{def.versionNumber}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`app-badge ${v2StatusBadgeClass(def.status === "active" ? "running" : def.status)}`}>
            {def.status}
          </span>
          <button
            onClick={() => router.push(`/w/${workspaceId}/workflows/editor?edit=${encodeURIComponent(def.workflowKey)}`)}
            className="app-button-secondary"
            title={t("workspace.edit")}
          >
            <Pencil size={14} />{t("workspace.edit")}
          </button>
        </div>
      </div>

      {/* Visual step flow */}
      {def.definition && steps.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">{t("workflow.stepPipeline")}</p>
          <WorkflowFlowDiagram definition={def.definition} overview={def.overview} />
        </div>
      )}
    </section>
  );
}

// ── Instances Section (filtered by definitionId) ──

function InstancesSection({
  workspaceId, definitionId, refreshKey,
}: { workspaceId: string; definitionId: string; refreshKey: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [instances, setInstances] = useState<InstanceDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const json = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: InstanceDetail[];
      }>(
        `/api/workspaces/${workspaceId}/workflows/instances?limit=50&definitionId=${encodeURIComponent(definitionId)}`,
        { cache: "no-store" }
      );
      if (!json.success) {
        throw new Error(json.error?.message ?? t("workflow.loadFailed"));
      }
      setInstances(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workflow.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, definitionId, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="app-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <Layers size={16} className="text-indigo-600" />
            {t("workflow.instancesTitle")}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{t("workflow.instancesHint")}</p>
        </div>
        <button onClick={() => void load()} className="app-button-secondary" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {loading && instances.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflow.loadingInstances")}</p>
      ) : error ? (
        <div className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      ) : instances.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflow.noInstances")}</p>
      ) : (
        <ul className="space-y-4">
          {instances.map((inst) => {
            const def = inst.definition;
            const hasRecord = Boolean(inst.object_type && inst.record_id);
            return (
              <li key={inst.id} className="rounded-lg border border-slate-100 p-4">
                {/* Header row: status, record link, run detail link */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Layers size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {inst.definitionName ?? def?.name ?? t("workflow.instanceId")}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {t("workflow.status")}: <span className={`app-badge ${v2StatusBadgeClass(inst.status)}`}>{inst.status}</span>
                      {" · "}{t("workflow.startedAt")}: {new Date(inst.started_at).toLocaleString()}
                    </p>
                  </div>
                  {hasRecord && (
                    <button
                      onClick={() => router.push(`/w/${workspaceId}/${objectKeyToRouteSegment(inst.object_type)}/${inst.record_id}`)}
                      className="app-button-secondary min-h-8"
                      title={t("workflow.record")}
                    >
                      <ExternalLink size={14} />{t("workflow.record")}
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/w/${workspaceId}/workflows/runs/${inst.id}`)}
                    className="app-button-secondary min-h-8"
                    title={t("workflow.viewRunDetail")}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Run timeline with step states, outcomes, and next action */}
                {def && (
                  <div className="mt-3 pl-12">
                    <WorkflowRunTimeline definition={def} runProjection={inst.runProjection} />
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
