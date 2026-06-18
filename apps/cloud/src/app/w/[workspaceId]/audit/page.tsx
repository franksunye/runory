"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AuditTimeline from "@/components/AuditTimeline";

export default function AuditPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/audit`);
        const json = await res.json();
        if (json.success) {
          setLogs(json.data);
        } else {
          setError(json.error?.message ?? "加载失败");
        }
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">审计日志</h1>
        <p className="mt-1 text-sm text-slate-500">
          工作区内所有变更操作记录（共 {logs.length} 条）
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <AuditTimeline logs={logs} />
    </div>
  );
}
