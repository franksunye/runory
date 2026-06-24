"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SchemaForm from "./SchemaForm";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useFields,
  useViews,
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

  useWorkspaceChangeEvent(workspaceId);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = loadingObj || loadingViews;
  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === viewKey)?.config ?? null;

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
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          ← {backLabel ?? t("workspace.backToList", { title })}
        </button>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{t("workspace.createTitle", { title })}</h1>
        {(subtitle ?? t("workspace.createSubtitle")) && (
          <p className="mt-1 text-sm text-slate-500">{subtitle ?? t("workspace.createSubtitle")}</p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {viewConfig ? (
        <SchemaForm
          fields={fields}
          viewConfig={viewConfig}
          onSubmit={handleSubmit}
          submitLabel={submitting ? t("workspace.saving") : t("workspace.save")}
          workspaceId={workspaceId}
        />
      ) : (
        <p className="text-sm text-slate-500">{t("workspace.viewNotFound")}</p>
      )}
    </div>
  );
}
