"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  type ValidationRunRecord,
  type ValidationCheck,
  type CatalogValidationResult,
  VALIDATION_STATUS_BADGE,
  formatDateTime,
  formatDuration,
  useAdminFetch,
} from "../../../../_components/shared";
import { apiPost } from "@/lib/api-fetch";

export default function ValidationPage() {
  const params = useParams<{ versionId: string }>();
  const versionId = params.versionId;

  const { data: runs, loading, error, reload } = useAdminFetch<ValidationRunRecord[]>(
    `/api/platform/catalog/versions/${versionId}/validate`
  );

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const handleRunValidation = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const json = await apiPost<{ success: boolean; error?: { message?: string } }>(`/api/platform/catalog/versions/${versionId}/validate`, {});
      if (!json.success) {
        setRunError(json.error?.message ?? "验证失败");
      } else {
        reload();
      }
    } catch {
      setRunError("验证失败");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">加载中...</p>;
  }

  const runList = runs ?? [];
  const selectedRun = selectedRunId ? runList.find((r) => r.id === selectedRunId) : runList[0] ?? null;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin?tab=catalog" className="hover:text-slate-700">Catalog</Link>
        <ChevronRight size={14} />
        <Link href={`/admin/catalog/versions/${versionId}`} className="hover:text-slate-700">版本</Link>
        <ChevronRight size={14} />
        <span className="text-slate-700">验证记录</span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">验证记录</h1>
        <button
          onClick={handleRunValidation}
          disabled={running}
          className="app-button-primary"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {running ? "验证中..." : "运行验证"}
        </button>
      </div>

      {runError && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{runError}</div>
      )}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {runList.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <ShieldCheck size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">暂无验证记录。点击"运行验证"开始。</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* Run list */}
          <div className="space-y-2">
            {runList.map((run) => {
              const badge = VALIDATION_STATUS_BADGE[run.status];
              const isSelected = (selectedRun?.id ?? runList[0]?.id) === run.id;
              return (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected ? "border-slate-950 bg-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.color}`}>{badge.label}</span>
                    {run.validatorVersion && <span className="text-xs text-slate-400">v{run.validatorVersion}</span>}
                  </div>
                  <p className="mt-1.5 font-mono text-xs text-slate-500">{run.id}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(run.createdAt)}</p>
                </button>
              );
            })}
          </div>

          {/* Selected run detail */}
          {selectedRun && <ValidationRunDetail run={selectedRun} />}
        </div>
      )}
    </div>
  );
}

function ValidationRunDetail({ run }: { run: ValidationRunRecord }) {
  const badge = VALIDATION_STATUS_BADGE[run.status];
  let result: CatalogValidationResult | null = null;
  if (run.resultJson) {
    try {
      result = JSON.parse(run.resultJson) as CatalogValidationResult;
    } catch {
      result = null;
    }
  }

  const checks = result?.checks ?? [];
  const passed = checks.filter((c) => c.status === "passed").length;
  const failed = checks.filter((c) => c.status === "failed").length;
  const warnings = checks.filter((c) => c.status === "warning").length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}>{badge.label}</span>
          <span className="font-mono text-sm text-slate-500">{run.id}</span>
        </div>
        {run.validatorVersion && (
          <span className="text-xs text-slate-400">Validator v{run.validatorVersion}</span>
        )}
      </div>

      {/* Timing */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">开始时间</p>
          <p className="mt-1 text-sm text-slate-700">{formatDateTime(run.startedAt)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">完成时间</p>
          <p className="mt-1 text-sm text-slate-700">{formatDateTime(run.completedAt)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">耗时</p>
          <p className="mt-1 text-sm text-slate-700">{formatDuration(run.startedAt, run.completedAt)}</p>
        </div>
      </div>

      {/* Summary */}
      {result?.summary && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">摘要</p>
          <p className="mt-1 text-sm text-slate-700">{result.summary}</p>
        </div>
      )}

      {/* Check counts */}
      {checks.length > 0 && (
        <div className="mt-4 flex gap-3">
          <CountPill label="通过" count={passed} color="text-emerald-700 bg-emerald-100" icon={CheckCircle2} />
          <CountPill label="失败" count={failed} color="text-red-700 bg-red-100" icon={XCircle} />
          <CountPill label="警告" count={warnings} color="text-amber-700 bg-amber-100" icon={AlertTriangle} />
        </div>
      )}

      {/* Checks list */}
      {checks.length > 0 ? (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-bold text-slate-900">检查项</h3>
          {checks.map((check, index) => (
            <CheckRow key={`${check.name}-${index}`} check={check} />
          ))}
        </div>
      ) : run.resultJson ? (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-slate-900">原始结果</h3>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            {run.resultJson}
          </pre>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">无详细结果。</p>
      )}
    </div>
  );
}

function CountPill({
  label,
  count,
  color,
  icon: Icon,
}: {
  label: string;
  count: number;
  color: string;
  icon: typeof CheckCircle2;
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${color}`}>
      <Icon size={14} /> {label}: {count}
    </div>
  );
}

function CheckRow({ check }: { check: ValidationCheck }) {
  const config = {
    passed: { color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle2 },
    failed: { color: "text-red-600", bg: "bg-red-50", icon: XCircle },
    warning: { color: "text-amber-600", bg: "bg-amber-50", icon: AlertTriangle },
  };
  const c = config[check.status];
  const Icon = c.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border border-slate-100 ${c.bg}`}>
      <button
        onClick={() => check.details && setExpanded(!expanded)}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        <Icon size={16} className={`mt-0.5 shrink-0 ${c.color}`} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">{check.name}</p>
          <p className="mt-0.5 text-xs text-slate-600">{check.message}</p>
        </div>
        {check.details && (
          <ChevronRight size={14} className={`mt-1 shrink-0 text-slate-400 transition ${expanded ? "rotate-90" : ""}`} />
        )}
      </button>
      {expanded && check.details && (
        <pre className="mx-3 mb-3 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-100">
          {JSON.stringify(check.details, null, 2)}
        </pre>
      )}
    </div>
  );
}
