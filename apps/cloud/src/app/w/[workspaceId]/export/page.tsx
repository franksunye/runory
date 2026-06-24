"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Package,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";

type ExportStatus = "pending" | "running" | "completed" | "failed";
type ExportFormat = "json" | "csv";

interface ExportJob {
  id: string;
  status: ExportStatus;
  manifestJson: string | null;
  downloadUrl: string | null;
  checksum: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface ObjectDef {
  id: string;
  objectKey: string;
  label: string;
}

const STATUS_META: Record<ExportStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "等待中", className: "bg-slate-100 text-slate-600", icon: Clock },
  running: { label: "进行中", className: "bg-blue-50 text-blue-700", icon: Loader2 },
  completed: { label: "已完成", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  failed: { label: "失败", className: "bg-red-50 text-red-700", icon: XCircle },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

function buildCsvSummary(manifest: Record<string, unknown>): string {
  const rows: string[] = ["section,count"];
  for (const [key, value] of Object.entries(manifest)) {
    const count = Array.isArray(value) ? value.length : 1;
    rows.push(`${key},${count}`);
  }
  return rows.join("\n");
}

export default function ExportPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [objects, setObjects] = useState<ObjectDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [format, setFormat] = useState<ExportFormat>("json");
  const [scope, setScope] = useState<"all" | "object">("all");
  const [objectKey, setObjectKey] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Import state (v0.3.6)
  const [importData, setImportData] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    valid: boolean;
    dryRun?: boolean;
    applied?: boolean;
    errors?: string[];
    warnings?: string[];
    stats?: Record<string, number>;
    imported?: Record<string, number>;
  } | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [jobsRes, objectsRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/export-jobs`),
        fetch(`/api/workspaces/${workspaceId}/objects`),
      ]);
      const jobsJson = await jobsRes.json();
      const objectsJson = await objectsRes.json();
      if (jobsJson.success) setJobs(jobsJson.data);
      if (objectsJson.success) {
        setObjects(objectsJson.data);
        if (objectsJson.data.length > 0 && !objectKey) {
          setObjectKey(objectsJson.data[0].objectKey);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, objectKey]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const handleCreateExport = async () => {
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/export-jobs`, {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const json = await res.json();
      if (json.success) {
        setMessage("导出任务已完成，可在下方下载");
        await loadData();
      } else {
        setError(json.error?.message ?? "创建导出失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建导出失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (job: ExportJob) => {
    setDownloadingId(job.id);
    setError(null);
    try {
      // Fetch the latest job state to get manifestJson
      const res = await fetch(`/api/workspaces/${workspaceId}/export-jobs/${job.id}`);
      const json = await res.json();
      if (!json.success || !json.data?.manifestJson) {
        throw new Error("无法获取导出内容");
      }
      const manifest = JSON.parse(json.data.manifestJson as string);

      // Apply scope filter
      let payload: Record<string, unknown> = manifest;
      if (scope === "object" && objectKey) {
        const objDef = (manifest.objects ?? []).find((o: ObjectDef) => o.objectKey === objectKey);
        payload = {
          workspace: manifest.workspace,
          object: objDef ?? null,
          fields: (manifest.fields ?? []).filter(
            (f: { objectKey: string }) => f.objectKey === objectKey
          ),
          views: (manifest.views ?? []).filter(
            (v: { objectKey: string }) => v.objectKey === objectKey
          ),
          exportedAt: manifest.exportedAt,
        };
      }

      let blob: Blob;
      let filename: string;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      if (format === "csv") {
        const csv = buildCsvSummary(payload);
        blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        filename = `export-${scope === "object" ? objectKey : "workspace"}-${stamp}.csv`;
      } else {
        blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        filename = `export-${scope === "object" ? objectKey : "workspace"}-${stamp}.json`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleImport = async (dryRun: boolean) => {
    if (!importData.trim()) {
      setError("请粘贴导出的 JSON 数据");
      return;
    }
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const parsed = JSON.parse(importData);
      const res = await fetch(`/api/workspaces/${workspaceId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ data: parsed, dryRun }),
      });
      const json = await res.json();
      if (json.success) {
        setImportResult(json.data);
      } else {
        setError(json.error?.message ?? "导入失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败：JSON 解析错误");
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-eyebrow">Export</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">数据导出</h1>
          <p className="mt-1 text-sm text-slate-500">导出工作区数据用于备份或迁移</p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); void loadData(); }}
          className="app-button-secondary self-start"
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

      {/* Export options */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Download size={18} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">创建新导出</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">导出格式</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormat("json")}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  format === "json"
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <FileJson size={15} />JSON
              </button>
              <button
                type="button"
                onClick={() => setFormat("csv")}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  format === "csv"
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <FileSpreadsheet size={15} />CSV
              </button>
            </div>
            {format === "csv" && (
              <p className="mt-1.5 text-[11px] text-slate-400">CSV 导出为各分区汇总（分区名与记录数）</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">导出范围</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "all" | "object")}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">全部数据</option>
              <option value="object">指定对象</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">目标对象</label>
            <select
              value={objectKey}
              onChange={(e) => setObjectKey(e.target.value)}
              disabled={scope !== "object"}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
            >
              {objects.length === 0 ? (
                <option value="">暂无对象</option>
              ) : (
                objects.map((o) => (
                  <option key={o.objectKey} value={o.objectKey}>
                    {o.label} ({o.objectKey})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleCreateExport}
            disabled={creating}
            className="app-button-primary"
          >
            <Download size={16} />
            {creating ? "导出中..." : "创建导出"}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          导出任务会同步执行并生成完整工作区快照。下载时将按上方选择的格式与范围进行渲染。
        </p>
      </section>

      {/* Export history */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Clock size={18} className="text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">导出历史</h2>
          <span className="app-badge bg-slate-100 text-slate-600">{jobs.length}</span>
        </div>
        {jobs.length === 0 ? (
          <div className="py-8 text-center">
            <Package size={32} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-400">暂无导出记录，点击上方按钮创建第一个导出</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {jobs.map((job) => {
              const meta = STATUS_META[job.status];
              const StatusIcon = meta.icon;
              return (
                <li key={job.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-slate-50 text-slate-500">
                      <StatusIcon size={16} className={job.status === "running" ? "animate-spin" : ""} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        导出任务
                        <span className="ml-2 font-mono text-xs font-normal text-slate-400">{job.id.slice(-8)}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        创建于 {formatDate(job.createdAt)}
                        {job.completedAt && ` · 完成于 ${formatDate(job.completedAt)}`}
                        {job.errorMessage && ` · 错误：${job.errorMessage}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`app-badge ${meta.className}`}>{meta.label}</span>
                    {job.status === "completed" && (
                      <button
                        type="button"
                        onClick={() => handleDownload(job)}
                        disabled={downloadingId === job.id}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Download size={14} />
                        {downloadingId === job.id ? "下载中..." : "下载"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Import (v0.3.6) */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Upload size={18} className="text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">数据导入</h2>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          粘贴之前导出的 JSON 数据以导入工作区元数据（对象、字段、视图、导航）。导入前请先使用"验证"进行预检。
        </p>
        <textarea
          value={importData}
          onChange={(e) => setImportData(e.target.value)}
          placeholder='{"workspace": {...}, "objects": [...], "fields": [...], ...}'
          className="app-input mb-3 h-32 font-mono text-xs"
          aria-label="导入 JSON 数据"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleImport(true)}
            disabled={importing || !importData.trim()}
            className="app-button-secondary"
          >
            {importing ? "处理中..." : "验证（Dry Run）"}
          </button>
          <button
            type="button"
            onClick={() => handleImport(false)}
            disabled={importing || !importData.trim()}
            className="app-button-primary"
          >
            {importing ? "处理中..." : "执行导入"}
          </button>
        </div>
        {importResult && (
          <div className={`mt-4 rounded-md p-4 text-sm ${importResult.valid ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
            <p className="font-bold">
              {importResult.valid ? "✓ 验证通过" : "✗ 验证失败"}
              {importResult.dryRun && "（Dry Run）"}
              {importResult.applied && "（已应用）"}
            </p>
            {importResult.errors && importResult.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {importResult.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
            {importResult.warnings && importResult.warnings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
                {importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            {importResult.stats && (
              <div className="mt-2 text-xs">
                <p>数据统计：{Object.entries(importResult.stats).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
              </div>
            )}
            {importResult.imported && (
              <div className="mt-1 text-xs">
                <p>已导入：{Object.entries(importResult.imported).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
