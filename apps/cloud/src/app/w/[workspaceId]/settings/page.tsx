"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

import ExtensionPanel from "@/components/ExtensionPanel";
import { notifyWorkspaceNavigationChanged } from "@/lib/workspace-events";

const CRM_LITE_PACK_ID = "crm-lite-pack";

export default function SettingsPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [installations, setInstallations] = useState<any[]>([]);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [versions, setVersions] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [instRes, extRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/installations`),
        fetch(`/api/workspaces/${workspaceId}/extensions`),
      ]);
      const instJson = await instRes.json();
      const extJson = await extRes.json();
      if (instJson.success) setInstallations(instJson.data);
      if (extJson.success) {
        setExtensions(extJson.data);
        const versionsMap: Record<string, any[]> = {};
        await Promise.all(
          extJson.data.map(async (ext: any) => {
            const vRes = await fetch(
              `/api/workspaces/${workspaceId}/extensions/${ext.id}/versions`
            );
            const vJson = await vRes.json();
            if (vJson.success) versionsMap[ext.id] = vJson.data;
          })
        );
        setVersions(versionsMap);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasCrmPack = installations.length > 0;

  const handleInstallPack = async () => {
    setInstalling(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/packs/${CRM_LITE_PACK_ID}/install`,
        { method: "POST" }
      );
      const json = await res.json();
      if (json.success) {
        setMessage(
          `CRM Lite Pack 安装成功，已创建对象：${json.data.objectsCreated.join(", ")}`
        );
        await loadData();
        notifyWorkspaceNavigationChanged();
      } else {
        setError(json.error?.message ?? "安装失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "安装失败");
    } finally {
      setInstalling(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/export`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        const blob = new Blob([JSON.stringify(json.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `workspace-${workspaceId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError(json.error?.message ?? "导出失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">设置</h1>
          <p className="mt-1 text-sm text-slate-500">
            管理模块、扩展和工作区数据
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {exporting ? "导出中..." : "导出工作区"}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">已安装模块</h3>
          {!hasCrmPack && (
            <button
              type="button"
              onClick={handleInstallPack}
              disabled={installing}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {installing ? "安装中..." : "安装 CRM Lite Pack"}
            </button>
          )}
        </div>
        {installations.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            尚未安装任何模块。点击上方按钮安装 CRM Lite Pack。
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
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
                    版本 {inst.moduleVersion}
                    {inst.packId ? ` · Pack: ${inst.packId}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  {inst.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          扩展版本历史
        </h3>
        {extensions.length === 0 ? (
          <p className="text-sm text-slate-500">暂无扩展</p>
        ) : (
          <div className="space-y-4">
            {extensions.map((ext) => (
              <div key={ext.id} className="rounded-md border border-slate-100">
                <div className="border-b border-slate-100 px-4 py-2.5">
                  <p className="text-sm font-medium text-slate-800">
                    {ext.name}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      ({ext.namespace})
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    当前版本 #{ext.currentVersion} · 状态：{ext.status}
                  </p>
                </div>
                <ul className="divide-y divide-slate-50">
                  {(versions[ext.id] ?? []).map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between px-4 py-2 text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-700">
                          v{v.version}
                        </span>
                        <span className="ml-2 text-slate-500">
                          {v.changeSummary}
                        </span>
                        {v.rollbackOfVersion != null && (
                          <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                            回滚自 v{v.rollbackOfVersion}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">
                          {v.riskLevel}
                        </span>
                        <span>{v.createdBy}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <ExtensionPanel
        workspaceId={workspaceId}
        extensions={extensions}
        onRefresh={loadData}
      />
    </div>
  );
}
