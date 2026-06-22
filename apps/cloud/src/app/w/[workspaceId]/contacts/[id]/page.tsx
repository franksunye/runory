"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SchemaForm from "@/components/SchemaForm";
import type { FieldDefinition } from "@runory/platform-core";

const OBJECT_KEY = "contact";
const VIEW_KEY = "contact_form";

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const recordId = params.id as string;

  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [viewConfig, setViewConfig] = useState<any>(null);
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [objRes, viewsRes, recordRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}`),
          fetch(`/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/views`),
          fetch(
            `/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records/${recordId}`
          ),
        ]);
        const objJson = await objRes.json();
        const viewsJson = await viewsRes.json();
        const recordJson = await recordRes.json();
        if (objJson.success) setFields(objJson.data.fields);
        if (viewsJson.success) {
          const view = viewsJson.data.find(
            (v: any) => v.viewKey === VIEW_KEY
          );
          setViewConfig(view?.config ?? null);
        }
        if (recordJson.success) {
          setRecord(recordJson.data);
        } else {
          setError(recordJson.error?.message ?? "记录不存在");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId, recordId]);

  const handleUpdate = async (data: Record<string, any>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records/${recordId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (json.success) {
        setRecord(json.data);
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
    if (!confirm("确定要删除此联系人吗？此操作不可撤销。")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records/${recordId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.success) {
        router.push(`/w/${workspaceId}/contacts`);
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
        {error && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <Link
          href={`/w/${workspaceId}/contacts`}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← 返回联系人列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/w/${workspaceId}/contacts`}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            ← 返回联系人列表
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            联系人详情
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
