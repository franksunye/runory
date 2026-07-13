"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
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
  activeWorkspaces: number;
  activeSessions: number;
  installations: number;
  apiKeys: number;
  workspaceMemberships: number;
  organizationMemberships: number;
  packDistribution: Array<{ packId: string; count: number }>;
  demoDataLoaded: number;
  demoDataNotLoaded: number;
  latestMigration: string | null;
  auditEvents24h: number;
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

export const LIFECYCLE_BADGE: Record<CatalogVersion["lifecycleStatus"], { label: MessageKey; color: string; icon: LucideIcon }> = {
  draft: { label: "admin.badge.lifecycle.draft", color: "bg-slate-100 text-slate-600", icon: Clock },
  validating: { label: "admin.badge.lifecycle.validating", color: "bg-blue-100 text-blue-700", icon: Loader2 },
  rejected: { label: "admin.badge.lifecycle.rejected", color: "bg-red-100 text-red-700", icon: XCircle },
  ready: { label: "admin.badge.lifecycle.ready", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  deprecated: { label: "admin.badge.lifecycle.deprecated", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  withdrawn: { label: "admin.badge.lifecycle.withdrawn", color: "bg-red-100 text-red-700", icon: Ban },
};

export const RELEASE_BADGE: Record<CatalogRelease["channel"], { label: MessageKey; color: string }> = {
  internal: { label: "admin.badge.release.internal", color: "bg-slate-100 text-slate-700" },
  beta: { label: "admin.badge.release.beta", color: "bg-purple-100 text-purple-700" },
  stable: { label: "admin.badge.release.stable", color: "bg-emerald-100 text-emerald-700" },
};

export const ITEM_TYPE_BADGE: Record<CatalogItem["itemType"], { label: MessageKey; color: string }> = {
  module: { label: "admin.badge.itemType.module", color: "bg-indigo-100 text-indigo-700" },
  pack: { label: "admin.badge.itemType.pack", color: "bg-violet-100 text-violet-700" },
  template: { label: "admin.badge.itemType.template", color: "bg-teal-100 text-teal-700" },
};

export const ROLLOUT_STATUS_BADGE: Record<ReleaseRollout["status"], { label: MessageKey; color: string }> = {
  draft: { label: "admin.badge.rolloutStatus.draft", color: "bg-slate-100 text-slate-600" },
  running: { label: "admin.badge.rolloutStatus.running", color: "bg-blue-100 text-blue-700" },
  paused: { label: "admin.badge.rolloutStatus.paused", color: "bg-amber-100 text-amber-700" },
  resumed: { label: "admin.badge.rolloutStatus.resumed", color: "bg-blue-100 text-blue-700" },
  completed: { label: "admin.badge.rolloutStatus.completed", color: "bg-emerald-100 text-emerald-700" },
  canceled: { label: "admin.badge.rolloutStatus.canceled", color: "bg-red-100 text-red-700" },
};

export const ROLLOUT_TARGET_STATUS_BADGE: Record<RolloutTarget["status"], { label: MessageKey; color: string }> = {
  pending: { label: "admin.badge.targetStatus.pending", color: "bg-slate-100 text-slate-600" },
  running: { label: "admin.badge.targetStatus.running", color: "bg-blue-100 text-blue-700" },
  succeeded: { label: "admin.badge.targetStatus.succeeded", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "admin.badge.targetStatus.failed", color: "bg-red-100 text-red-700" },
  skipped: { label: "admin.badge.targetStatus.skipped", color: "bg-slate-100 text-slate-500" },
};

export const VALIDATION_STATUS_BADGE: Record<ValidationRunRecord["status"], { label: MessageKey; color: string }> = {
  queued: { label: "admin.badge.validationStatus.queued", color: "bg-slate-100 text-slate-600" },
  running: { label: "admin.badge.validationStatus.running", color: "bg-blue-100 text-blue-700" },
  passed: { label: "admin.badge.validationStatus.passed", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "admin.badge.validationStatus.failed", color: "bg-red-100 text-red-700" },
};

// ── Confirm Dialog Config ──

export const CONFIRM_CONFIG: Record<
  "withdraw" | "deprecate" | "reject" | "promote",
  { title: MessageKey; description: MessageKey; confirmLabel: MessageKey; variant: "danger" | "warning" | "success" }
> = {
  withdraw: {
    title: "admin.shared.confirm.withdraw.title",
    description: "admin.shared.confirm.withdraw.description",
    confirmLabel: "admin.shared.confirm.withdraw.confirmLabel",
    variant: "danger",
  },
  deprecate: {
    title: "admin.shared.confirm.deprecate.title",
    description: "admin.shared.confirm.deprecate.description",
    confirmLabel: "admin.shared.confirm.deprecate.confirmLabel",
    variant: "warning",
  },
  reject: {
    title: "admin.shared.confirm.reject.title",
    description: "admin.shared.confirm.reject.description",
    confirmLabel: "admin.shared.confirm.reject.confirmLabel",
    variant: "danger",
  },
  promote: {
    title: "admin.shared.confirm.promote.title",
    description: "admin.shared.confirm.promote.description",
    confirmLabel: "admin.shared.confirm.promote.confirmLabel",
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
  const { t } = useI18n();
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
        if (!cancelled) setError(t("admin.common.loadError"));
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
  const { t } = useI18n();
  const config = CONFIRM_CONFIG[type];
  const reasonValid = reason.trim().length >= 10;
  const channelLabel = channel ? t(RELEASE_BADGE[channel].label) : null;

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
            {t(config.title)}
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

        <p className="mt-2 text-sm text-slate-600">{t(config.description)}</p>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            {t("admin.shared.confirm.reasonLabel")} <span className="font-normal text-slate-400">{t("admin.shared.confirm.reasonMinLength")}</span>
          </label>
          <textarea
            className="app-input min-h-[96px] resize-y"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={t("admin.shared.confirm.reasonPlaceholder")}
            disabled={busy}
            autoFocus
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className={reasonValid ? "text-emerald-600" : "text-slate-400"}>
              {reasonValid ? t("admin.shared.confirm.reasonValid") : t("admin.shared.confirm.reasonNeedMore", { count: Math.max(0, 10 - reason.trim().length) })}
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
            {t("admin.common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={!reasonValid || busy}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed ${confirmColors[config.variant]}`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? t("admin.shared.confirm.executing") : t(config.confirmLabel)}
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
