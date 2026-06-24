"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, RotateCcw, Trash2, Package } from "lucide-react";

interface ObjectDef {
  objectKey: string;
  label: string;
}

interface DeletedRecord {
  id: string;
  [key: string]: unknown;
}

export default function TrashPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [objects, setObjects] = useState<ObjectDef[]>([]);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [records, setRecords] = useState<DeletedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const loadObjects = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/objects`);
      const json = await res.json();
      if (json.success) {
        setObjects(json.data);
        if (json.data.length > 0 && !selectedObject) {
          setSelectedObject(json.data[0].objectKey);
        }
      } else {
        setError(json.error?.message ?? "加载失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, selectedObject]);

  const loadRecords = useCallback(async (objectKey: string) => {
    setLoadingRecords(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records?onlyDeleted=true`
      );
      const json = await res.json();
      if (json.success) {
        setRecords(json.data);
      } else {
        setRecords([]);
        setError(json.error?.message ?? "加载失败");
      }
    } catch (e) {
      setRecords([]);
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoadingRecords(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  useEffect(() => {
    if (selectedObject) loadRecords(selectedObject);
    else setRecords([]);
  }, [selectedObject, loadRecords]);

  const handleRestore = async (objectKey: string, recordId: string) => {
    setRestoring(recordId);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ action: "restore" }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setMessage("记录已恢复");
        setRecords((prev) => prev.filter((r) => r.id !== recordId));
      } else {
        setError(json.error?.message ?? "恢复失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setRestoring(null);
    }
  };

  const handleHardDelete = async (objectKey: string, recordId: string) => {
    if (!confirm("永久删除后无法恢复，确定继续吗？")) return;
    setRestoring(recordId);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}?hard=true`,
        {
          method: "DELETE",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        }
      );
      const json = await res.json();
      if (json.success) {
        setMessage("记录已永久删除");
        setRecords((prev) => prev.filter((r) => r.id !== recordId));
      } else {
        setError(json.error?.message ?? "删除失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setRestoring(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  const currentObject = objects.find((o) => o.objectKey === selectedObject);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Trash</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">回收站</h1>
          <p className="mt-1 text-sm text-slate-500">
            查看和恢复已删除的记录。软删除的记录可在此恢复，也可永久删除。
          </p>
        </div>
        <button
          type="button"
          onClick={() => { if (selectedObject) loadRecords(selectedObject); }}
          className="app-button-secondary"
        >
          <RefreshCw size={16} />刷新
        </button>
      </header>

      {error && <div role="alert" className="app-error">{error}</div>}
      {message && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {objects.length === 0 ? (
        <div className="app-card p-8 text-center">
          <Package size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">工作区暂无业务对象</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
          {/* Object selector */}
          <nav className="flex gap-2 overflow-x-auto lg:flex-col">
            {objects.map((obj) => (
              <button
                key={obj.objectKey}
                type="button"
                onClick={() => setSelectedObject(obj.objectKey)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  selectedObject === obj.objectKey
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {obj.label}
              </button>
            ))}
          </nav>

          {/* Records table */}
          <div className="app-card overflow-hidden">
            {loadingRecords ? (
              <div className="p-8 text-center text-sm text-slate-400">加载中...</div>
            ) : records.length === 0 ? (
              <div className="p-8 text-center">
                <Trash2 size={32} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">
                  {currentObject ? `${currentObject.label} 没有已删除的记录` : "请选择一个对象"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="px-4 py-3">记录 ID</th>
                      <th className="px-4 py-3">名称 / 标识</th>
                      <th className="px-4 py-3">删除时间</th>
                      <th className="px-4 py-3">删除者</th>
                      <th className="px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {String(record.id).slice(0, 16)}…
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {String(record.name ?? record.title ?? record.email ?? "—")}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {record.deleted_at
                            ? new Date(record.deleted_at as string).toLocaleString("zh-CN")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">
                          {String(record.deleted_by ?? "—")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleRestore(selectedObject!, record.id)}
                              disabled={restoring === record.id}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <RotateCcw size={12} />
                              恢复
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHardDelete(selectedObject!, record.id)}
                              disabled={restoring === record.id}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                            >
                              <Trash2 size={12} />
                              永久删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
