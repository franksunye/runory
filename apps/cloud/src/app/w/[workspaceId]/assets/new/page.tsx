"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SchemaForm from "@/components/SchemaForm";
import type { FieldDefinition } from "@runory/platform-core";

const OBJECT_KEY = "asset";
const VIEW_KEY = "asset_form";

export default function NewAssetPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [viewConfig, setViewConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [objRes, viewsRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}`),
          fetch(`/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/views`),
        ]);
        const objJson = await objRes.json();
        const viewsJson = await viewsRes.json();
        if (objJson.success) setFields(objJson.data.fields);
        if (viewsJson.success) {
          const view = viewsJson.data.find(
            (v: any) => v.viewKey === VIEW_KEY
          );
          setViewConfig(view?.config ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  const handleSubmit = async (data: Record<string, any>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (json.success) {
        router.push(`/w/${workspaceId}/assets`);
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
        <h1 className="text-2xl font-bold text-slate-900">新建资产</h1>
        <p className="mt-1 text-sm text-slate-500">
          填写资产信息后保存
        </p>
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
