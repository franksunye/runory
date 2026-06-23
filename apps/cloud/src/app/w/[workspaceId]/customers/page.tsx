"use client";

import { useEffect, useMemo, useState } from "react";
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

const OBJECT_KEY = "customer";
const VIEW_KEY = "customer_list";

export default function CustomerListPage() {
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
  const extensionFields = fields.filter((field) => field.ownership === "workspace_extension");
  const extensionSignature = useMemo(
    () => extensionFields.map((field) => field.fieldKey).sort().join("|"),
    [extensionFields]
  );
  const extensionNoticeKey = `runory:${workspaceId}:${OBJECT_KEY}:extension-notice:${extensionSignature}`;
  const [showExtensionNotice, setShowExtensionNotice] = useState(false);

  useEffect(() => {
    if (!extensionSignature) {
      setShowExtensionNotice(false);
      return;
    }
    setShowExtensionNotice(localStorage.getItem(extensionNoticeKey) !== "dismissed");
  }, [extensionNoticeKey, extensionSignature]);

  const dismissExtensionNotice = () => {
    localStorage.setItem(extensionNoticeKey, "dismissed");
    setShowExtensionNotice(false);
  };

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
        <div className="space-y-3">
          {showExtensionNotice && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">新的工作区字段已可用</p>
                  <p className="mt-1 text-purple-800">
                    {extensionFields.map((field) => field.label).join(", ")}
                    {" "}已加入 Customer 列表和表单。此提示仅在字段变更后出现一次。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissExtensionNotice}
                  className="min-w-fit rounded-md border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-100"
                >
                  知道了
                </button>
              </div>
            </div>
          )}
          <SchemaTable
            fields={fields}
            viewConfig={viewConfig}
            records={records}
            workspaceId={workspaceId}
            objectKey={OBJECT_KEY}
          />
        </div>
      ) : (
        <p className="text-sm text-slate-500">未找到列表视图配置。</p>
      )}
    </div>
  );
}
