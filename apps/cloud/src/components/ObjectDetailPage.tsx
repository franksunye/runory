"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import SchemaForm from "./SchemaForm";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useFields,
  useViews,
  useRecord,
  useRecords,
  useWorkspaceChangeEvent,
  type WorkspaceRecord,
} from "@/lib/api-hooks";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";

export interface ParentLinkConfig {
  /** Field on this record that holds the parent record's id */
  foreignKey: string;
  /** Object key of the parent (e.g. "company") */
  parentObjectKey: string;
  /** Section label, e.g. "关联公司" */
  label: string;
  /** Field on the parent record to display as link text */
  titleField: string;
  /** Route base for the link, e.g. "/w/{workspaceId}/companies" */
  routeBase: string;
}

export interface RelatedRecordsConfig {
  /** Object key to fetch (e.g. "contact") */
  objectKey: string;
  /** Field on the related record that points back to this record's id */
  foreignKey: string;
  /** Section heading, e.g. "关联联系人" */
  label: string;
  /** Field to display as the link text */
  titleField: string;
  /** Route base for links, e.g. "/w/{workspaceId}/contacts" — workspaceId will be substituted */
  routeBase: string;
  /** Optional secondary fields to show after the title */
  secondaryFields?: string[];
}

export interface ObjectDetailPageProps {
  objectKey: string;
  viewKey: string;
  basePath: string;
  title: string;
  /** Singular noun shown in delete confirm, e.g. "公司" */
  singularLabel?: string;
  backLabel?: string;
  /** Optional parent-record links (e.g. contact → company) */
  parentLinks?: ParentLinkConfig[];
  /** Optional related-records panels */
  related?: RelatedRecordsConfig[];
}

function ParentLinkPanel({
  workspaceId,
  record,
  config,
}: {
  workspaceId: string;
  record: WorkspaceRecord;
  config: ParentLinkConfig;
}) {
  const parentId = record[config.foreignKey] as string | undefined;
  const { data: parentRecord } = useSWR<WorkspaceRecord>(
    parentId ? `/api/workspaces/${workspaceId}/objects/${config.parentObjectKey}/records/${parentId}` : null
  );
  if (!parentId) return null;
  const routeBase = config.routeBase.replace("{workspaceId}", workspaceId);
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{config.label}</p>
      <div className="mt-1 text-sm">
        {parentRecord ? (
          <Link
            href={`${routeBase}/${parentId}`}
            className="font-medium text-blue-600 hover:text-blue-800"
          >
            {String(parentRecord[config.titleField] ?? parentId)}
          </Link>
        ) : (
          <span className="text-slate-400">加载中...</span>
        )}
      </div>
    </div>
  );
}

function RelatedRecordsPanel({
  workspaceId,
  recordId,
  config,
}: {
  workspaceId: string;
  recordId: string;
  config: RelatedRecordsConfig;
}) {
  const { data: allRecords = [] } = useRecords(workspaceId, config.objectKey, {
    search: recordId,
  });
  const filtered = allRecords.filter(
    (r) => String(r[config.foreignKey]) === String(recordId)
  );
  if (filtered.length === 0) return null;

  const routeBase = config.routeBase.replace("{workspaceId}", workspaceId);
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {config.label}（{filtered.length}）
      </p>
      <ul className="mt-2 space-y-1">
        {filtered.map((r) => (
          <li key={String(r.id)}>
            <Link
              href={`${routeBase}/${r.id}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              {String(r[config.titleField] ?? "未命名")}
            </Link>
            {config.secondaryFields?.map((sf) =>
              r[sf] ? (
                <span key={sf} className="ml-2 text-xs text-slate-500">
                  {String(r[sf])}
                </span>
              ) : null
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ObjectDetailPage({
  objectKey,
  viewKey,
  basePath,
  title,
  singularLabel,
  backLabel,
  parentLinks = [],
  related = [],
}: ObjectDetailPageProps) {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const recordId = params.id as string;

  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, objectKey);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, objectKey);
  const { data: record, error: recordError, isLoading: loadingRecord, mutate: mutateRecord } = useRecord(workspaceId, objectKey, recordId);

  useWorkspaceChangeEvent(workspaceId);

  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = loadingObj || loadingViews || loadingRecord;
  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === viewKey)?.config ?? null;
  const label = singularLabel ?? title;

  const handleUpdate = async (data: Record<string, any>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`,
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
        setError(json.error?.message ?? "更新失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除此${label}吗？此操作不可撤销。`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`,
        { method: "DELETE", headers: { "X-Requested-With": "XMLHttpRequest" } }
      );
      const json = await res.json();
      if (json.success) {
        notifyWorkspaceDataChanged();
        router.push(basePath);
        router.refresh();
      } else {
        setError(json.error?.message ?? "删除失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  if (!record) {
    return (
      <div className="space-y-4">
        {(error || recordError) && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error ?? (recordError instanceof Error ? recordError.message : "记录不存在")}
          </div>
        )}
        <Link
          href={basePath}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← {backLabel ?? `返回${title}列表`}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={basePath}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            ← {backLabel ?? `返回${title}列表`}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {title}详情
          </h1>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "删除中..." : "删除"}
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
          submitLabel={submitting ? "保存中..." : "保存"}
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
                        扩展
                      </span>
                    )}
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">
                    {field.type === "boolean"
                      ? value
                        ? "是"
                        : "否"
                      : value === null || value === undefined || value === ""
                        ? "—"
                        : String(value)}
                  </dd>
                </div>
              );
            })}
          </dl>

          {/* Parent record links */}
          {parentLinks.length > 0 && (
            <>
              {parentLinks.map((cfg) => (
                <ParentLinkPanel
                  key={cfg.foreignKey}
                  workspaceId={workspaceId}
                  record={record}
                  config={cfg}
                />
              ))}
            </>
          )}

          {/* Related records panels */}
          {related.length > 0 && (
            <div className="mt-6 space-y-4 border-t border-slate-100 pt-4">
              {related.map((cfg) => (
                <RelatedRecordsPanel
                  key={cfg.objectKey}
                  workspaceId={workspaceId}
                  recordId={recordId}
                  config={cfg}
                />
              ))}
            </div>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <p>记录 ID：{String(record.id ?? "")}</p>
            <p>创建时间：{String(record.created_at ?? "")}</p>
            <p>更新时间：{String(record.updated_at ?? "")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
