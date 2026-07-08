"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  Snowflake,
  X,
  XCircle,
  ArrowUpCircle,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

// ── Types ──

export interface AdminStats {
  organizations: number;
  users: number;
  workspaces: number;
  activeSessions: number;
  installations: number;
  apiKeys: number;
  workspaceMemberships: number;
  organizationMemberships: number;
}

export interface CatalogItem {
  id: string;
  itemType: "module" | "pack" | "template";
  name: string;
  description: string | null;
  publisherId: string;
  visibility: "internal" | "public";
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface CatalogVersion {
  id: string;
  catalogItemId: string;
  version: string;
  lifecycleStatus: "draft" | "validating" | "rejected" | "ready" | "deprecated" | "withdrawn";
  manifestJson: string;
  manifestSchemaVersion: string;
  artifactUri: string | null;
  artifactChecksum: string | null;
  sourceRepository: string | null;
  sourceCommit: string | null;
  buildId: string | null;
  createdBy: string;
  frozenAt: string | null;
  createdAt: string;
}

export interface CatalogRelease {
  id: string;
  catalogVersionId: string;
  channel: "internal" | "beta" | "stable";
  status: "active" | "superseded" | "paused" | "withdrawn";
  releaseNotes: string | null;
  approvedBy: string | null;
  releasedAt: string;
  createdAt: string;
}

export interface ReleaseRollout {
  id: string;
  catalogReleaseId: string;
  targetType: "allowlist" | "percentage" | "all_eligible";
  targetConfigJson: string;
  status: "draft" | "running" | "paused" | "resumed" | "completed" | "canceled";
  successThreshold: number;
  failureThreshold: number;
  startedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface RolloutProgress {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  skipped: number;
  successRate: number;
  failureRate: number;
}

export interface RolloutTarget {
  id: string;
  rolloutId: string;
  workspaceId: string;
  fromVersionId: string | null;
  toVersionId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  reasonCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ValidationRunRecord {
  id: string;
  status: "queued" | "running" | "passed" | "failed";
  validatorVersion: string | null;
  resultJson: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ValidationCheck {
  name: string;
  status: "passed" | "failed" | "warning";
  message: string;
  details?: Record<string, unknown>;
}

export interface CatalogValidationResult {
  status: "queued" | "running" | "passed" | "failed";
  checks: ValidationCheck[];
  summary: string;
}

// ── Badge Configs ──

export const LIFECYCLE_BADGE: Record<CatalogVersion["lifecycleStatus"], { label: string; color: string; icon: LucideIcon }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-600", icon: Clock },
  validating: { label: "Validating", color: "bg-blue-100 text-blue-700", icon: Loader2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700", icon: XCircle },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  deprecated: { label: "Deprecated", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  withdrawn: { label: "Withdrawn", color: "bg-red-100 text-red-700", icon: Ban },
};

export const RELEASE_BADGE: Record<CatalogRelease["channel"], { label: string; color: string }> = {
  internal: { label: "Internal", color: "bg-slate-100 text-slate-700" },
  beta: { label: "Beta", color: "bg-purple-100 text-purple-700" },
  stable: { label: "Stable", color: "bg-emerald-100 text-emerald-700" },
};

export const ITEM_TYPE_BADGE: Record<CatalogItem["itemType"], { label: string; color: string }> = {
  module: { label: "Module", color: "bg-indigo-100 text-indigo-700" },
  pack: { label: "Pack", color: "bg-violet-100 text-violet-700" },
  template: { label: "Template", color: "bg-teal-100 text-teal-700" },
};

export const ROLLOUT_STATUS_BADGE: Record<ReleaseRollout["status"], { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-600" },
  running: { label: "Running", color: "bg-blue-100 text-blue-700" },
  paused: { label: "Paused", color: "bg-amber-100 text-amber-700" },
  resumed: { label: "Resumed", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700" },
  canceled: { label: "Canceled", color: "bg-red-100 text-red-700" },
};

export const ROLLOUT_TARGET_STATUS_BADGE: Record<RolloutTarget["status"], { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-slate-100 text-slate-600" },
  running: { label: "Running", color: "bg-blue-100 text-blue-700" },
  succeeded: { label: "Succeeded", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700" },
  skipped: { label: "Skipped", color: "bg-slate-100 text-slate-500" },
};

export const VALIDATION_STATUS_BADGE: Record<ValidationRunRecord["status"], { label: string; color: string }> = {
  queued: { label: "Queued", color: "bg-slate-100 text-slate-600" },
  running: { label: "Running", color: "bg-blue-100 text-blue-700" },
  passed: { label: "Passed", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700" },
};

// ── Confirm Dialog Config ──

export const CONFIRM_CONFIG: Record<
  "withdraw" | "deprecate" | "reject" | "promote",
  { title: string; description: string; confirmLabel: string; variant: "danger" | "warning" | "success" }
> = {
  withdraw: {
    title: "确认下架",
    description: "此操作不可撤销。下架后，所有已安装该版本的工作区将无法再获取该版本，且相关 Release 将被标记为 withdrawn。请输入下架原因（如安全问题、严重缺陷等）。",
    confirmLabel: "确认下架",
    variant: "danger",
  },
  deprecate: {
    title: "确认弃用",
    description: "弃用后，该版本将不再推荐安装，但已安装的工作区可继续使用。将通知所有已安装的工作区该版本已弃用。请输入弃用原因。",
    confirmLabel: "确认弃用",
    variant: "warning",
  },
  reject: {
    title: "确认拒绝",
    description: "此操作不可撤销。拒绝后，该版本将进入 Rejected 状态，需要重新创建版本才能再次提交。请输入拒绝原因以便记录。",
    confirmLabel: "确认拒绝",
    variant: "danger",
  },
  promote: {
    title: "确认发布",
    description: "发布后，该版本将通过所选通道对所有符合条件的工作区可见，并通知已订阅的工作区。请输入发布说明/原因。",
    confirmLabel: "确认发布",
    variant: "success",
  },
};

// ── Helpers ──

export function toList(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function parseManifest(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN");
}

export function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// ── useAdminFetch hook: fetch with 403 redirect ──

export function useAdminFetch<T>(
  url: string | null,
  deps: unknown[] = []
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const reload = useCallback(() => setReloadCount((c) => c + 1), []);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const json = await apiFetch<{ data?: T }>(url, { cache: "no-store" });
        if (!cancelled) setData(json.data ?? null);
      } catch (e) {
        if (e instanceof Error && e.message.includes("403")) {
          router.replace("/login");
          return;
        }
        if (!cancelled) setError("加载数据失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadCount, ...deps]);

  return { data, loading, error, reload };
}

// ── Action Button ──

export function ActionButton({
  label,
  icon: Icon,
  onClick,
  loading,
  variant = "default",
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  loading: boolean;
  variant?: "default" | "success" | "danger" | "warning";
}) {
  const colors = {
    default: "border-slate-300 text-slate-700 hover:bg-slate-50",
    success: "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
    danger: "border-red-300 text-red-700 hover:bg-red-50",
    warning: "border-amber-300 text-amber-700 hover:bg-amber-50",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${colors[variant]}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {label}
    </button>
  );
}

// ── Confirm Dialog ──

export function ConfirmDialog({
  type,
  channel,
  reason,
  onReasonChange,
  busy,
  onCancel,
  onConfirm,
}: {
  type: "withdraw" | "deprecate" | "reject" | "promote";
  channel?: "internal" | "beta" | "stable";
  reason: string;
  onReasonChange: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const config = CONFIRM_CONFIG[type];
  const reasonValid = reason.trim().length >= 10;
  const channelLabel = channel ? RELEASE_BADGE[channel].label : null;

  const confirmColors = {
    danger: "bg-red-600 hover:bg-red-700 disabled:bg-red-300",
    warning: "bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300",
    success: "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">
            {config.title}
            {channelLabel && (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {channelLabel}
              </span>
            )}
          </h2>
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600">{config.description}</p>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            操作原因 <span className="font-normal text-slate-400">（至少 10 个字符）</span>
          </label>
          <textarea
            className="app-input min-h-[96px] resize-y"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="请详细描述执行此操作的原因，将记录在审计日志中..."
            disabled={busy}
            autoFocus
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className={reasonValid ? "text-emerald-600" : "text-slate-400"}>
              {reasonValid ? "✓ 已满足最小长度" : `还需 ${Math.max(0, 10 - reason.trim().length)} 个字符`}
            </span>
            <span className="text-slate-400">{reason.trim().length} / 500</span>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!reasonValid || busy}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed ${confirmColors[config.variant]}`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "执行中..." : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Re-export icons commonly used ──

export {
  AlertTriangle,
  ArrowUpCircle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  Snowflake,
  X,
  XCircle,
};
