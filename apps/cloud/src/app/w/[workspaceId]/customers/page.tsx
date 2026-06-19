"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SchemaTable from "@/components/SchemaTable";
import type { FieldDefinition } from "@runory/platform-core";

const OBJECT_KEY = "customer";
const VIEW_KEY = "customer_list";

export default function CustomerListPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [viewConfig, setViewConfig] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [hasPack, setHasPack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const instRes = await fetch(
          `/api/workspaces/${workspaceId}/installations`
        );
        const instJson = await instRes.json();
        const installed =
          instJson.success && instJson.data.length > 0;
        setHasPack(installed);
        if (!installed) {
          setLoading(false);
          return;
        }

        const [objRes, viewsRes, recordsRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}`),
          fetch(`/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/views`),
          fetch(`/api/workspaces/${workspaceId}/objects/${OBJECT_KEY}/records`),
        ]);
        const objJson = await objRes.json();
        const viewsJson = await viewsRes.json();
        const recordsJson = await recordsRes.json();

        if (objJson.success) setFields(objJson.data.fields);
        if (viewsJson.success) {
          const view = viewsJson.data.find(
            (v: any) => v.viewKey === VIEW_KEY
          );
          setViewConfig(view?.config ?? null);
        }
        if (recordsJson.success) setRecords(recordsJson.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">客户</h1>
          <p className="mt-1 text-sm text-slate-500">管理所有客户记录</p>
        </div>
        {hasPack && (
          <button
            type="button"
            onClick={() =>
              router.push(`/w/${workspaceId}/customers/new`)
            }
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            添加客户
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!hasPack ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-center">
          <p className="text-sm text-blue-700">
            尚未安装业务模块，无法显示客户列表。
          </p>
          <Link
            href={`/w/${workspaceId}/dashboard`}
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            前往仪表盘安装 CRM Lite Pack →
          </Link>
        </div>
      ) : viewConfig ? (
        <SchemaTable
          fields={fields}
          viewConfig={viewConfig}
          records={records}
          workspaceId={workspaceId}
          objectKey={OBJECT_KEY}
        />
      ) : (
        <p className="text-sm text-slate-500">未找到列表视图配置。</p>
      )}
    </div>
  );
}
