"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import SchemaForm from "./SchemaForm";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useFields,
  useViews,
  useWorkspaceChangeEvent,
} from "@/lib/api-hooks";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useI18n } from "@/i18n/locale-provider";
import { apiPost } from "@/lib/api-fetch";

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
  const searchParams = useSearchParams();
  const workspaceId = params.workspaceId as string;
  const { t } = useI18n();

  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, objectKey);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, objectKey);

  useWorkspaceChangeEvent(workspaceId);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = loadingObj || loadingViews;
  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === viewKey)?.config ?? null;
  const parentField = searchParams.get("parentField");
  const parentId = searchParams.get("parentId");
  const requestedReturnTo = searchParams.get("returnTo");
  const returnTo = requestedReturnTo?.startsWith(`/w/${workspaceId}/`) ? requestedReturnTo : basePath;
  const contextValues = parentField && parentId ? { [parentField]: parentId } : {};

  const handleSubmit = async (data: Record<string, any>) => {
    setSubmitting(true);
    setError(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records`,
        { ...data, ...contextValues }
      );
      if (json.success) {
        notifyWorkspaceDataChanged();
        router.push(returnTo);
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
          onClick={() => router.push(returnTo)}
          className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
        >
          ← {backLabel ?? (parentField ? t("workspace.backToParent") : t("workspace.backToList", { title }))}
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
          initialValues={contextValues}
          hiddenFields={parentField ? [parentField] : []}
          onSubmit={handleSubmit}
          onCancel={() => router.push(returnTo)}
          submitLabel={submitting ? t("workspace.saving") : t("workspace.save")}
          workspaceId={workspaceId}
        />
      ) : (
        <p className="text-sm text-slate-500">{t("workspace.viewNotFound")}</p>
      )}
    </div>
  );
}
