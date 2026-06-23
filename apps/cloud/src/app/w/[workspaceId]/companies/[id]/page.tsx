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
  useRecords,
  useWorkspaceChangeEvent,
} from "@/lib/api-hooks";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";

const OBJECT_KEY = "company";
const VIEW_KEY = "company_form";

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const recordId = params.id as string;

  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, OBJECT_KEY);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, OBJECT_KEY);
  const { data: record, error: recordError, isLoading: loadingRecord, mutate: mutateRecord } = useRecord(workspaceId, OBJECT_KEY, recordId);

  // Fetch related contacts, deals and tasks linked to this company
  const { data: relatedContacts = [] } = useRecords(workspaceId, "contact", { search: recordId });
  const { data: relatedDeals = [] } = useRecords(workspaceId, "deal", { search: recordId });
  const { data: relatedTasks = [] } = useRecords(workspaceId, "task", { search: recordId });

  useWorkspaceChangeEvent(workspaceId);

  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = loadingObj || loadingViews || loadingRecord;
  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === VIEW_KEY)?.config ?? null;

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
        setError(json.error?.message ?? "更新失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("确定要删除此公司吗？此操作不可撤销。")) return;
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
        router.push(`/w/${workspaceId}/companies`);
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
          href={`/w/${workspaceId}/companies`}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← 返回公司列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/w/${workspaceId}/companies`}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            ← 返回公司列表
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            公司详情
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

          {/* Related contacts, deals and tasks */}
          {(() => {
            const contacts = relatedContacts.filter(
              (c) => String(c.primary_company_id) === recordId
            );
            const deals = relatedDeals.filter(
              (d) => String(d.company_id) === recordId
            );
            const tasks = relatedTasks.filter(
              (t) => String(t.company_id) === recordId
            );
            if (contacts.length === 0 && deals.length === 0 && tasks.length === 0) return null;
            return (
              <div className="mt-6 space-y-4 border-t border-slate-100 pt-4">
                {contacts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      关联联系人（{contacts.length}）
                    </p>
                    <ul className="mt-2 space-y-1">
                      {contacts.map((c) => (
                        <li key={String(c.id)}>
                          <Link
                            href={`/w/${workspaceId}/contacts/${c.id}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            {String(c.name ?? "未命名")}
                          </Link>
                          {c.role ? (
                            <span className="ml-2 text-xs text-slate-500">
                              {String(c.role)}
                            </span>
                          ) : null}
                          {c.email ? (
                            <span className="ml-2 text-xs text-slate-400">
                              {String(c.email)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {deals.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      关联商机（{deals.length}）
                    </p>
                    <ul className="mt-2 space-y-1">
                      {deals.map((d) => (
                        <li key={String(d.id)}>
                          <Link
                            href={`/w/${workspaceId}/deals/${d.id}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            {String(d.name ?? "未命名")}
                          </Link>
                          {d.stage ? (
                            <span className="ml-2 text-xs text-slate-500">
                              {String(d.stage)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tasks.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      关联任务（{tasks.length}）
                    </p>
                    <ul className="mt-2 space-y-1">
                      {tasks.map((t) => (
                        <li key={String(t.id)}>
                          <Link
                            href={`/w/${workspaceId}/tasks/${t.id}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            {String(t.title ?? "未命名")}
                          </Link>
                          {t.status ? (
                            <span className="ml-2 text-xs text-slate-500">
                              {String(t.status)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <p>记录 ID：{record.id}</p>
            <p>创建时间：{record.created_at}</p>
            <p>更新时间：{record.updated_at}</p>
          </div>
        </div>
      )}
    </div>
  );
}
