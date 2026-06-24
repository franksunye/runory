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
  subtitle = "填写信息后保存",
  backLabel,
}: ObjectCreatePageProps) {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

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
        setError(json.error?.message ?? "创建失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          ← {backLabel ?? `返回${title}列表`}
        </button>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">新建{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
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
          submitLabel={submitting ? "保存中..." : "保存"}
        />
      ) : (
        <p className="text-sm text-slate-500">未找到表单视图配置。</p>
      )}
    </div>
  );
}
