"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SchemaForm from "@/components/SchemaForm";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useFields,
  useViews,
  useRecord,
  useWorkspaceChangeEvent,
} from "@/lib/api-hooks";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useI18n } from "@/i18n/locale-provider";

const OBJECT_KEY = "landing_page";
const VIEW_KEY = "landing_page_form";

export default function LandingPageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const workspaceId = params.workspaceId as string;
  const recordId = params.id as string;

  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, OBJECT_KEY);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, OBJECT_KEY);
  const { data: record, error: recordError, isLoading: loadingRecord, mutate: mutateRecord } = useRecord(workspaceId, OBJECT_KEY, recordId);

  useWorkspaceChangeEvent(workspaceId);

  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = loadingObj || loadingViews || loadingRecord;
  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === VIEW_KEY)?.config ?? null;
  const currentStatus = record?.status as string | undefined;
  const isPublished = currentStatus === "published";
  const isUnpublished = currentStatus === "unpublished";

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records/${recordId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ action: "publish" }),
        }
      );
      const json = await res.json();
      if (json.success) {
        await mutateRecord(json.data.record);
        notifyWorkspaceDataChanged();
      } else {
        setError(json.error?.message ?? t("landingPages.detail.publishFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("landingPages.detail.publishFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!confirm(t("landingPages.detail.unpublishConfirm"))) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records/${recordId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ action: "unpublish" }),
        }
      );
      const json = await res.json();
      if (json.success) {
        await mutateRecord(json.data.record);
        notifyWorkspaceDataChanged();
      } else {
        setError(json.error?.message ?? t("landingPages.detail.unpublishFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("landingPages.detail.unpublishFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const handleUpdate = async (data: Record<string, any>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records/${recordId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (json.success) {
        await mutateRecord(json.data);
        notifyWorkspaceDataChanged();
        setEditing(false);
      } else {
        setError(json.error?.message ?? t("workspace.updateFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.updateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("workspace.deleteConfirm", { label: t("landingPages.title") }))) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records/${recordId}`,
        { method: "DELETE", headers: { "X-Requested-With": "XMLHttpRequest" } }
      );
      const json = await res.json();
      if (json.success) {
        notifyWorkspaceDataChanged();
        router.push(`/w/${workspaceId}/landing-pages`);
        router.refresh();
      } else {
        setError(json.error?.message ?? t("workspace.deleteFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  if (!record) {
    return (
      <div className="space-y-4">
        {(error || recordError) && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error ?? (recordError instanceof Error ? recordError.message : t("workspace.recordNotFound"))}
          </div>
        )}
        <Link
          href={`/w/${workspaceId}/landing-pages`}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          {t("landingPages.detail.backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/w/${workspaceId}/landing-pages`}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {t("landingPages.detail.backToList")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {t("workspace.detailTitle", { title: t("landingPages.title") })}
          </h1>
        </div>
        {!editing && (
          <div className="flex gap-2">
            {!isPublished && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {publishing ? t("landingPages.detail.processing") : t("landingPages.detail.publish")}
              </button>
            )}
            {isPublished && (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={publishing}
                className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {publishing ? t("landingPages.detail.processing") : t("landingPages.detail.unpublish")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("workspace.edit")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? t("workspace.deleting") : t("workspace.delete")}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {editing && viewConfig ? (
        <SchemaForm
          fields={fields}
          viewConfig={viewConfig}
          initialValues={record}
          onSubmit={handleUpdate}
          submitLabel={submitting ? t("workspace.saving") : t("workspace.save")}
        />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {fields.map((field) => {
              const value = record[field.fieldKey];
              const isExtension =
                field.ownership === "workspace_extension";
              return (
                <div key={field.id}>
                  <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                    {field.label}
                    {isExtension && (
                      <span className="rounded bg-purple-100 px-1 text-[10px] font-medium text-purple-700">
                        {t("workspace.extension")}
                      </span>
                    )}
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">
                    {field.type === "boolean"
                      ? value
                        ? t("workspace.yes")
                        : t("workspace.no")
                      : value === null || value === undefined || value === ""
                        ? "—"
                        : String(value)}
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <p>{t("workspace.recordId", { id: String(record.id ?? "") })}</p>
            <p>{t("workspace.createdAt", { time: String(record.created_at ?? "") })}</p>
            <p>{t("workspace.updatedAt", { time: String(record.updated_at ?? "") })}</p>
          </div>
        </div>
      )}
    </div>
  );
}
