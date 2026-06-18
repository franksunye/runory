"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AuditTimeline from "@/components/AuditTimeline";

const CRM_LITE_PACK_ID = "crm-lite-pack";

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  const [installations, setInstallations] = useState<any[]>([]);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [instRes, extRes, auditRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/installations`),
        fetch(`/api/workspaces/${workspaceId}/extensions`),
        fetch(`/api/workspaces/${workspaceId}/audit`),
      ]);
      const instJson = await instRes.json();
      const extJson = await extRes.json();
      const auditJson = await auditRes.json();
      if (instJson.success) setInstallations(instJson.data);
      if (extJson.success) setExtensions(extJson.data);
      if (auditJson.success) setAuditLogs(auditJson.data.slice(0, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const hasCrmPack = installations.length > 0;

  const handleInstallPack = async () => {
    setInstalling(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/packs/${CRM_LITE_PACK_ID}/install`,
        { method: "POST" }
      );
      const json = await res.json();
      if (json.success) {
        router.refresh();
        await loadData();
      } else {
        setError(json.error?.message ?? "安装失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "安装失败");
    } finally {
      setInstalling(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">仪表盘</h1>
        <p className="mt-1 text-sm text-slate-500">工作区概览</p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!hasCrmPack && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h3 className="text-sm font-semibold text-blue-900">
            还没有安装任何业务模块
          </h3>
          <p className="mt-1 text-sm text-blue-700">
            安装 CRM Lite Pack 以启用客户和联系人管理功能。
          </p>
          <button
            type="button"
            onClick={handleInstallPack}
            disabled={installing}
            className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {installing ? "安装中..." : "安装 CRM Lite Pack"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            已安装模块
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {installations.length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            已创建扩展
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {extensions.length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            审计日志
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {auditLogs.length}
          </p>
        </div>
      </div>

      {hasCrmPack && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            已安装模块
          </h3>
          <ul className="divide-y divide-slate-100">
            {installations.map((inst) => (
              <li
                key={inst.id}
                className="flex items-center justify-between py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {inst.moduleId}
                  </p>
                  <p className="text-xs text-slate-500">
                    版本 {inst.moduleVersion} ·{" "}
                    {inst.packId ? `Pack: ${inst.packId}` : "独立模块"}
                  </p>
                </div>
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  {inst.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">最近审计日志</h3>
          <Link
            href={`/w/${workspaceId}/audit`}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            查看全部 →
          </Link>
        </div>
        <AuditTimeline logs={auditLogs} />
      </div>
    </div>
  );
}
