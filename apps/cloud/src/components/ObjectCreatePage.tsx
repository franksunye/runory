"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import SchemaForm from "./SchemaForm";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useFields,
  useViews,
  useWorkflowDefinitions,
  useWorkspaceChangeEvent,
} from "@/lib/api-hooks";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useI18n } from "@/i18n/locale-provider";

export interface ObjectCreatePageProps {
  objectKey: string;
  viewKey: string;
  basePath: string;
  title: string;
  subtitle?: string;
  backLabel?: string;
}

export default function ObjectCreatePage({
  objectKey,
  viewKey,
  basePath,
  title,
  subtitle,
  backLabel,
}: ObjectCreatePageProps) {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const { t } = useI18n();

  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, objectKey);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, objectKey);
  const { data: workflowDefs } = useWorkflowDefinitions(workspaceId);

  useWorkspaceChangeEvent(workspaceId);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = loadingObj || loadingViews;
  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === viewKey)?.config ?? null;

  // Check for auto-start workflow: if a workflow definition has autoStart=true
  // and targets this object with a stateField, lock that field and pre-fill
  // it with the workflow's initialState.
  const autoStartInfo = useMemo(() => {
    if (!workflowDefs) return null;
    const def = workflowDefs.find(
      d => d.autoStart && d.targetObject === objectKey && d.stateField
    );
    if (!def || !def.stateField) return null;
    return { stateField: def.stateField, initialState: def.initialState };
  }, [workflowDefs, objectKey]);

  const readOnlyFields = useMemo(() => {
    if (!autoStartInfo) return {};
    return {
      [autoStartInfo.stateField]: t("workspace.workflow.autoStartLocked", { state: autoStartInfo.initialState }),
    };
  }, [autoStartInfo, t]);

  const initialValues = useMemo(() => {
    if (!autoStartInfo) return undefined;
    return { [autoStartInfo.stateField]: autoStartInfo.initialState } as Record<string, string | number | boolean | null>;
  }, [autoStartInfo]);

  const handleSubmit = async (data: Record<string, any>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (json.success) {
        notifyWorkspaceDataChanged();
        router.push(basePath);
        router.refresh();
      } else {
        setError(json.error?.message ?? t("workspace.createFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.createFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="app-skeleton h-8 w-48" />
        <div className="app-card space-y-4 p-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="app-skeleton h-11 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter">
      <div>
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
        >
          ← {backLabel ?? t("workspace.backToList", { title })}
        </button>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{t("workspace.createTitle", { title })}</h1>
        {(subtitle ?? t("workspace.createSubtitle")) && (
          <p className="mt-2 text-sm text-slate-500">{subtitle ?? t("workspace.createSubtitle")}</p>
        )}
      </div>

      {error && (
        <div className="app-error">{error}</div>
      )}

      {viewConfig ? (
        <SchemaForm
          fields={fields}
          viewConfig={viewConfig}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={() => router.push(basePath)}
          submitLabel={submitting ? t("workspace.saving") : t("workspace.save")}
          workspaceId={workspaceId}
          readOnlyFields={readOnlyFields}
        />
      ) : (
        <p className="text-sm text-slate-500">{t("workspace.viewNotFound")}</p>
      )}
    </div>
  );
}
