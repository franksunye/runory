"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SchemaTable from "@/components/SchemaTable";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useInstallations,
  useFields,
  useViews,
  useRecords,
  useWorkspaceChangeEvent,
} from "@/lib/api-hooks";

const OBJECT_KEY = "task";
const VIEW_KEY = "task_list";

export default function TaskListPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  const { data: installations = [], isLoading: loadingInst } = useInstallations(workspaceId);
  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, OBJECT_KEY);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, OBJECT_KEY);
  const { data: records = [], isLoading: loadingRecords } = useRecords(workspaceId, OBJECT_KEY);

  useWorkspaceChangeEvent(workspaceId);

  const hasPack = installations.length > 0;
  const loading = loadingInst || (hasPack && (loadingObj || loadingViews || loadingRecords));

  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === VIEW_KEY)?.config ?? null;

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">任务</h1>
          <p className="mt-1 text-sm text-slate-500">管理所有任务记录</p>
        </div>
        {hasPack && (
          <button
            type="button"
            onClick={() =>
              router.push(`/w/${workspaceId}/tasks/new`)
            }
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            添加任务
          </button>
        )}
      </div>

      {!hasPack ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-center">
          <p className="text-sm text-blue-700">
            尚未安装业务模块，无法显示任务列表。
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
