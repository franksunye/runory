"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, RefreshCw, AlertCircle, Loader2,
  Layers, ExternalLink, Clock,
} from "lucide-react";
import type {
  WorkflowDefinition, WorkflowRunProjection,
} from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch } from "@/lib/api-fetch";
import WorkflowRunTimeline from "@/components/workflow/WorkflowRunTimeline";

// ── Types ──

interface WorkItemRow {
  id: string;
  instance_id: string;
  step_id: string;
  kind: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
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
  definition: Record<string, unknown> | null;
  runProjection: WorkflowRunProjection | null;
  events: unknown[];
}

// ── Constants & Helpers ──

function v2StatusBadgeClass(status: string): string {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "running") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

// ── Page ──

export default function WorkflowRunDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const runId = params.runId as string;
  const router = useRouter();
  const { t } = useI18n();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={15} />
          {t("workflow.editorBack")}
        </button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="app-eyebrow">Step workflows</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">
              {t("workflow.runDetail")}
            </h1>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button onClick={() => setRefreshKey((k) => k + 1)} className="app-button-secondary"><RefreshCw size={16} />{t("workspace.refresh")}</button>
          </div>
        </div>
      </header>

      <RunDetailSection
        workspaceId={workspaceId}
        runId={runId}
        refreshKey={refreshKey}
      />
    </div>
  );
}

// ── Run Detail Section ──

function RunDetailSection({
  workspaceId, runId, refreshKey,
}: { workspaceId: string; runId: string; refreshKey: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const json = await apiFetch<{
        success: boolean;
        error?: { message: string };
        data?: InstanceDetail | null;
      }>(
        `/api/workspaces/${workspaceId}/workflows/instances/${runId}`,
        { cache: "no-store" }
      );
      if (!json.success) {
        throw new Error(json.error?.message ?? t("workflow.loadFailed"));
      }
      if (!json.data) {
        throw new Error(t("workflow.runNotFound"));
      }
      setInstance(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workflow.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, runId, t]);

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

  if (!instance) return null;

  const def = instance.definition as unknown as WorkflowDefinition | null;
  const hasRecord = Boolean(instance.object_type && instance.record_id);

  return (
    <section className="app-card p-5 sm:p-6">
      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
          <Layers size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">
            {def?.name ?? t("workflow.instanceId")}
          </h2>
          <p className="text-xs text-slate-500">
            {def && (
              <>{t("workflow.workflowKey")}: <span className="font-mono">{def.workflowKey}</span></>
            )}
          </p>
        </div>
        <span className={`app-badge ${v2StatusBadgeClass(instance.status)}`}>
          {instance.status}
        </span>
      </div>

      {/* Meta info */}
      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Clock size={13} />
          {t("workflow.startedAt")}: {new Date(instance.started_at).toLocaleString()}
        </span>
        {instance.completed_at && (
          <span className="flex items-center gap-1.5">
            <Clock size={13} />
            {t("workflow.completedAt")}: {new Date(instance.completed_at).toLocaleString()}
          </span>
        )}
        {hasRecord && (
          <button
            onClick={() => router.push(`/w/${workspaceId}/o/${instance.object_type}/${instance.record_id}`)}
            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700"
          >
            <ExternalLink size={13} />
            {t("workflow.record")}
          </button>
        )}
      </div>

      {/* Run timeline with step states, outcomes, and next action */}
      {def && (
        <WorkflowRunTimeline definition={def} runProjection={instance.runProjection} />
      )}
    </section>
  );
}
