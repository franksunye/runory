"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Play,
  Pause,
  Ban,
  Loader2,
} from "lucide-react";
import {
  type ReleaseRollout,
  type RolloutProgress,
  type RolloutTarget,
  ROLLOUT_STATUS_BADGE,
  ROLLOUT_TARGET_STATUS_BADGE,
  formatDateTime,
  useAdminFetch,
} from "../../_components/shared";
import { apiPost } from "@/lib/api-fetch";
import { useI18n } from "@/i18n/locale-provider";

interface RolloutDetail {
  rollout: ReleaseRollout;
  progress: RolloutProgress;
  targets: RolloutTarget[];
}

export default function RolloutDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ rolloutId: string }>();
  const rolloutId = params.rolloutId;

  const { data, loading, error, reload } = useAdminFetch<RolloutDetail>(
    `/api/platform/rollouts/${rolloutId}`
  );

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (action: "pause" | "resume" | "cancel") => {
    setActionLoading(true);
    setActionError(null);
    try {
      const needsReason = action === "pause" || action === "cancel";
      const body = needsReason ? { reason: `Operator ${action} action` } : {};
      const json = await apiPost<{ success: boolean; error?: { message?: string } }>(`/api/platform/rollouts/${rolloutId}/${action}`, body);
      if (!json.success) {
        setActionError(json.error?.message ?? t("admin.common.actionFailed", { action }));
      } else {
        reload();
      }
    } catch {
      setActionError(t("admin.common.actionFailed", { action }));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">{t("admin.common.loading")}</p>;
  }

  if (error || !data) {
    return (
      <div>
        <Link href="/admin/releases" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> {t("admin.releases.detail.backToReleases")}
        </Link>
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? t("admin.rollouts.detail.notFound")}
        </div>
      </div>
    );
  }

  const { rollout, progress, targets } = data;
  const badge = ROLLOUT_STATUS_BADGE[rollout.status];
  const isActive = rollout.status === "running" || rollout.status === "resumed";
  const isPaused = rollout.status === "paused";
  const showControls = isActive || isPaused;

  const progressPct = progress.total > 0
    ? Math.round(((progress.succeeded + progress.failed + progress.skipped) / progress.total) * 100)
    : 0;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin/releases" className="hover:text-slate-700">{t("admin.nav.releases")}</Link>
        <ChevronRight size={14} />
        <Link href={`/admin/releases/${rollout.catalogReleaseId}`} className="hover:text-slate-700">{t("admin.releases.detail.breadcrumbRelease")}</Link>
        <ChevronRight size={14} />
        <span className="font-mono text-slate-700">{rollout.id}</span>
      </div>

      {/* Header */}
      <div className="mt-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{t("admin.rollouts.detail.title")}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}>{t(badge.label)}</span>
      </div>

      {actionError && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      {/* Metadata */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">{t("admin.rollouts.detail.metadata")}</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <MetaRow label={t("admin.rollouts.id")} value={rollout.id} mono />
            <MetaRow label={t("admin.rollouts.releaseId")} value={rollout.catalogReleaseId} mono />
            <MetaRow label={t("admin.rollouts.targetType")} value={rollout.targetType} />
            <MetaRow label={t("admin.common.status")} value={t(badge.label)} />
            <MetaRow label={t("admin.rollouts.successThreshold")} value={`${(rollout.successThreshold * 100).toFixed(0)}%`} />
            <MetaRow label={t("admin.rollouts.failureThreshold")} value={`${(rollout.failureThreshold * 100).toFixed(0)}%`} />
            {rollout.startedBy && <MetaRow label={t("admin.rollouts.startedBy")} value={rollout.startedBy} mono />}
            <MetaRow label={t("admin.rollouts.detail.startedAt")} value={formatDateTime(rollout.startedAt)} />
            <MetaRow label={t("admin.rollouts.detail.completedAt")} value={formatDateTime(rollout.completedAt)} />
            <MetaRow label={t("admin.common.createdAt")} value={formatDateTime(rollout.createdAt)} />
          </dl>
        </div>

        {/* Progress */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">{t("admin.rollouts.detail.progress")}</h3>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{t("admin.rollouts.detail.progressLabel")}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Counts */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <ProgressStat label={t("admin.rollouts.detail.total")} value={progress.total} color="text-slate-900" />
            <ProgressStat label={t("admin.rollouts.detail.succeeded")} value={progress.succeeded} color="text-emerald-700" />
            <ProgressStat label={t("admin.rollouts.detail.failed")} value={progress.failed} color="text-red-700" />
            <ProgressStat label={t("admin.rollouts.detail.running")} value={progress.running} color="text-blue-700" />
            <ProgressStat label={t("admin.rollouts.detail.pending")} value={progress.pending} color="text-slate-600" />
            <ProgressStat label={t("admin.rollouts.detail.skipped")} value={progress.skipped} color="text-slate-400" />
          </div>

          {/* Rates */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-slate-500">{t("admin.rollouts.detail.successRate")}</p>
              <p className="mt-1 text-lg font-bold text-emerald-700">{(progress.successRate * 100).toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-xs font-semibold text-slate-500">{t("admin.rollouts.detail.failureRate")}</p>
              <p className="mt-1 text-lg font-bold text-red-700">{(progress.failureRate * 100).toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      {showControls && (
        <div className="mt-6 flex gap-2">
          {isActive && (
            <button
              onClick={() => handleAction("pause")}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Pause size={16} />}
              {t("admin.common.pause")}
            </button>
          )}
          {isPaused && (
            <button
              onClick={() => handleAction("resume")}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {t("admin.common.resume")}
            </button>
          )}
          <button
            onClick={() => handleAction("cancel")}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {t("admin.common.cancel")}
          </button>
        </div>
      )}

      {/* Target list */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-slate-950">{t("admin.rollouts.detail.targetList")}</h2>
        {targets.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("admin.rollouts.detail.noTargets")}</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.rollouts.detail.workspace")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.common.status")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.rollouts.detail.fromVersion")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.rollouts.detail.toVersion")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.rollouts.detail.reason")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.rollouts.detail.startedAt")}</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.rollouts.detail.completedAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {targets.map((target) => {
                  const statusBadge = ROLLOUT_TARGET_STATUS_BADGE[target.status];
                  return (
                    <tr key={target.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{target.workspaceId}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge.color}`}>
                          {t(statusBadge.label)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{target.fromVersionId ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{target.toVersionId}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{target.reasonCode ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(target.startedAt)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(target.completedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`text-right text-sm text-slate-700 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function ProgressStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
