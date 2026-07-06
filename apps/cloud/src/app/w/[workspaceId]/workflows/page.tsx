"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus, RefreshCw, AlertCircle, Loader2,
  Layers, ListChecks, ExternalLink, FileText, Workflow, ArrowRight,
  Pencil,
} from "lucide-react";
import type {
  WorkflowDefinitionV2, WorkflowStep, WorkflowStepKind,
} from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";

// ── Types ──

/** API response shape for a V2 definition row (from definitions-v2 endpoint). */
interface V2DefinitionDetail {
  id: string;
  workspaceId: string;
  workflowKey: string;
  name: string;
  targetObject: string;
  status: string;
  versionNumber: number;
  definition: WorkflowDefinitionV2 | null;
  createdAt: string;
  updatedAt: string;
}

/** API response shape for a V2 instance detail (DB rows are snake_case). */
interface V2InstanceDetail {
  id: string;
  workflow_definition_id: string;
  object_type: string;
  record_id: string;
  status: string;
  current_step_id: string | null;
  version: number;
  started_at: string;
  completed_at: string | null;
  work_items: V2WorkItemRow[];
  definition: WorkflowDefinitionV2 | null;
}

interface V2WorkItemRow {
  id: string;
  instance_id: string;
  step_id: string;
  kind: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
}

// ── Constants & Helpers ──

const V2_STEP_KIND_LABEL_KEY: Record<WorkflowStepKind, MessageKey> = {
  start: "workflowV2.stepKindStart",
  human_task: "workflowV2.stepKindHumanTask",
  approval: "workflowV2.stepKindApproval",
  system_command: "workflowV2.stepKindSystemCommand",
  wait: "workflowV2.stepKindWait",
  end: "workflowV2.stepKindEnd",
};

function v2StatusBadgeClass(status: string): string {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "running") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

function v2StepKindBadgeClass(kind: WorkflowStepKind): string {
  switch (kind) {
    case "start": return "bg-sky-50 text-sky-700";
    case "end": return "bg-slate-200 text-slate-700";
    case "approval": return "bg-amber-50 text-amber-700";
    case "human_task": return "bg-indigo-50 text-indigo-700";
    case "system_command": return "bg-violet-50 text-violet-700";
    case "wait": return "bg-slate-100 text-slate-600";
    default: return "bg-slate-100 text-slate-600";
  }
}

// ── Page ──

export default function WorkflowsPage() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const { t } = useI18n();
  // Shared refresh nonce so the header refresh button can reload both sections.
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Step workflows</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("workflowV2.pageTitle")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("workflowV2.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button onClick={() => setRefreshKey((k) => k + 1)} className="app-button-secondary"><RefreshCw size={16} />{t("workspace.refresh")}</button>
          <button onClick={() => router.push(`/w/${workspaceId}/workflows/editor`)} className="app-button-primary"><Plus size={16} />{t("workflowV2.createWorkflow")}</button>
        </div>
      </header>

      <V2DefinitionsSection workspaceId={workspaceId} refreshKey={refreshKey} />
      <V2InstancesSection workspaceId={workspaceId} refreshKey={refreshKey} />
    </div>
  );
}

// ── V2 Workflow Definitions Section ──

function V2DefinitionsSection({ workspaceId, refreshKey }: { workspaceId: string; refreshKey: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [definitions, setDefinitions] = useState<V2DefinitionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/workspaces/${workspaceId}/workflows/definitions-v2`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? t("workflowV2.loadFailed"));
      }
      setDefinitions(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workflowV2.loadFailed"));
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
            {t("workflowV2.definitions")}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{t("workflowV2.definitionsHint")}</p>
        </div>
        <button onClick={() => void load()} className="app-button-secondary" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {loading && definitions.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflowV2.loadingDefinitions")}</p>
      ) : error ? (
        <div className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflowV2.noDefinitions")}</p>
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
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {def.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {t("workflowV2.workflowKey")}: <span className="font-mono">{def.workflowKey}</span>
                      {" · "}{t("workflowV2.targetObject")}: <span className="font-mono">{def.targetObject}</span>
                      {" · v"}{def.versionNumber}
                    </p>
                  </div>
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

                {/* Step pipeline with form binding & assignee rule badges */}
                {steps.length > 0 && (
                  <div className="mt-3 pl-12">
                    <p className="mb-1.5 text-xs font-semibold text-slate-500">{t("workflowV2.stepPipeline")}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {steps.map((step, i) => {
                        const hasForm = Boolean(step.formBindingId);
                        const permissionGroup = step.assigneeRule?.permissionGroup;
                        return (
                          <span key={`${step.id}-${i}`} className="flex items-center gap-1.5">
                            <span
                              className={`app-badge ${v2StepKindBadgeClass(step.kind)}`}
                              title={hasForm ? t("workflowV2.formBound") : undefined}
                            >
                              {hasForm && (
                                <FileText size={11} className="mr-0.5 shrink-0" />
                              )}
                              {t(V2_STEP_KIND_LABEL_KEY[step.kind])}
                              <span className="font-mono text-[10px] opacity-70">{step.id}</span>
                            </span>
                            {hasForm && (
                              <span
                                className="app-badge bg-purple-50 text-purple-700"
                                title={t("workflowV2.stepForm")}
                              >
                                <FileText size={11} />
                                {t("workflowV2.stepForm")}: {step.formBindingId}
                              </span>
                            )}
                            {permissionGroup && (
                              <span
                                className="app-badge bg-slate-100 text-slate-600"
                                title={t("workflowV2.assigneeRule")}
                              >
                                {t("workflowV2.assigneeRule")}: {permissionGroup}
                              </span>
                            )}
                            {i < steps.length - 1 && <ArrowRight size={12} className="text-slate-300" />}
                          </span>
                        );
                      })}
                    </div>
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

// ── V2 Workflow Instances Section ──

function V2InstancesSection({ workspaceId, refreshKey }: { workspaceId: string; refreshKey: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [instances, setInstances] = useState<V2InstanceDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // 1. Fetch my-work items to discover V2 instance IDs
      const workRes = await fetch(
        `/api/workspaces/${workspaceId}/my-work?limit=100`,
        { cache: "no-store" }
      );
      const workJson = await workRes.json();
      if (!workJson.success) {
        throw new Error(workJson.error?.message ?? t("workflowV2.loadFailed"));
      }
      const items: V2WorkItemRow[] = workJson.data?.items ?? [];
      // 2. Group by instance_id to get unique V2 instance IDs
      const instanceIds = [...new Set(items.map((i) => i.instance_id))];
      if (instanceIds.length === 0) {
        setInstances([]);
        return;
      }
      // 3. Fetch each V2 instance detail (cap at 10 to avoid excessive calls)
      const details = await Promise.all(
        instanceIds.slice(0, 10).map(async (instId) => {
          try {
            const res = await fetch(
              `/api/workspaces/${workspaceId}/workflows/instances-v2/${instId}`,
              { cache: "no-store" }
            );
            const json = await res.json();
            return json.success ? (json.data as V2InstanceDetail) : null;
          } catch {
            return null;
          }
        })
      );
      setInstances(details.filter((d): d is V2InstanceDetail => d !== null));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workflowV2.loadFailed"));
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
            <Layers size={16} className="text-indigo-600" />
            {t("workflowV2.instancesTitle")}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{t("workflowV2.instancesHint")}</p>
        </div>
        <button onClick={() => void load()} className="app-button-secondary" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {loading && instances.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflowV2.loadingInstances")}</p>
      ) : error ? (
        <div className="app-error">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      ) : instances.length === 0 ? (
        <p className="text-sm text-slate-400">{t("workflowV2.noInstances")}</p>
      ) : (
        <ul className="space-y-4">
          {instances.map((inst) => (
            <V2InstanceRow key={inst.id} instance={inst}
              onOpenRecord={(ot, rid) => router.push(`/w/${workspaceId}/o/${ot}/${rid}`)} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── V2 Instance Row ──

interface V2InstanceRowProps {
  instance: V2InstanceDetail;
  onOpenRecord: (objectType: string, recordId: string) => void;
}

function V2InstanceRow({ instance, onOpenRecord }: V2InstanceRowProps) {
  const { t } = useI18n();
  const def = instance.definition;
  const steps: WorkflowStep[] = def?.steps ?? [];
  const currentStepId = instance.current_step_id;

  // Work items kind breakdown
  const breakdown = instance.work_items.reduce((acc, wi) => {
    acc[wi.kind] = (acc[wi.kind] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const hasRecord = Boolean(instance.object_type && instance.record_id);

  return (
    <li className="rounded-lg border border-slate-100 p-4">
      {/* Header row: instance ID, definition key, status, current step, record link */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
          <Layers size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {def?.name ?? def?.workflowKey ?? instance.workflow_definition_id}
          </p>
          <p className="truncate text-xs text-slate-500">
            {t("workflowV2.instanceId")}: <span className="font-mono">{instance.id}</span>
            {def && (
              <> · {t("workflowV2.definitionKey")}: <span className="font-mono">{def.workflowKey}</span></>
            )}
          </p>
        </div>
        <span className={`app-badge ${v2StatusBadgeClass(instance.status)}`}>{instance.status}</span>
        {currentStepId && (
          <span className="app-badge bg-slate-100 text-slate-700">
            {t("workflowV2.currentStep")}: <span className="font-mono">{currentStepId}</span>
          </span>
        )}
        {hasRecord && (
          <button
            onClick={() => onOpenRecord(instance.object_type, instance.record_id)}
            className="app-button-secondary min-h-8"
            title={t("workflowV2.record")}
          >
            <ExternalLink size={14} />{t("workflowV2.record")}
          </button>
        )}
      </div>

      {/* Step pipeline (horizontal badges) */}
      {steps.length > 0 && (
        <div className="mt-3 pl-12">
          <p className="mb-1.5 text-xs font-semibold text-slate-500">{t("workflowV2.stepPipeline")}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {steps.map((step, i) => {
              const isCurrent = step.id === currentStepId;
              const hasForm = Boolean(step.formBindingId);
              return (
                <span key={`${step.id}-${i}`} className="flex items-center gap-1.5">
                  <span
                    className={`app-badge ${v2StepKindBadgeClass(step.kind)} ${isCurrent ? "ring-2 ring-indigo-400" : ""}`}
                    title={hasForm ? t("workflowV2.formBound") : undefined}
                  >
                    {hasForm && (
                      <FileText size={11} className="mr-0.5 shrink-0" />
                    )}
                    {t(V2_STEP_KIND_LABEL_KEY[step.kind])}
                    <span className="font-mono text-[10px] opacity-70">{step.id}</span>
                  </span>
                  {i < steps.length - 1 && <ArrowRight size={12} className="text-slate-300" />}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Work items count with kind breakdown */}
      <div className="mt-3 pl-12">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <ListChecks size={13} />
          {t("workflowV2.workItemsBreakdown")}
          <span className="app-badge bg-slate-100 text-slate-600">{instance.work_items.length}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(breakdown).map(([kind, count]) => (
            <span key={kind} className="app-badge bg-slate-50 text-slate-600">
              {kind}: {count}
            </span>
          ))}
          {Object.keys(breakdown).length === 0 && (
            <span className="text-xs text-slate-400">{t("workflowV2.noInstances")}</span>
          )}
        </div>
      </div>
    </li>
  );
}
