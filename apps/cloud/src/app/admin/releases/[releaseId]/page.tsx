"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Play,
  Pause,
  Ban,
  X,
  Loader2,
} from "lucide-react";
import {
  type CatalogRelease,
  type CatalogVersion,
  type ReleaseRollout,
  type RolloutProgress,
  RELEASE_BADGE,
  ROLLOUT_STATUS_BADGE,
  formatDateTime,
  useAdminFetch,
} from "../../_components/shared";
import { apiFetch, apiPost } from "@/lib/api-fetch";
import { useI18n } from "@/i18n/locale-provider";

export default function ReleaseDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ releaseId: string }>();
  const releaseId = params.releaseId;

  const { data: release, loading: releaseLoading, error: releaseError, reload: reloadRelease } = useAdminFetch<CatalogRelease>(
    `/api/platform/releases/${releaseId}`
  );
  const { data: rollouts, loading: rolloutsLoading, reload: reloadRollouts } = useAdminFetch<ReleaseRollout[]>(
    `/api/platform/releases/${releaseId}/rollout`
  );

  const [version, setVersion] = useState<CatalogVersion | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showStartForm, setShowStartForm] = useState(false);

  const loadVersion = useCallback(async () => {
    if (!release) return;
    try {
      const json = await apiFetch<{ success: boolean; data?: CatalogVersion }>(`/api/platform/catalog/versions/${release.catalogVersionId}`, { cache: "no-store" });
      if (json.success) setVersion(json.data ?? null);
    } catch {
      // ignore
    }
  }, [release]);

  useEffect(() => { loadVersion(); }, [loadVersion]);

  const rolloutList = rollouts ?? [];
  const activeRollout = rolloutList.find((r) => r.status === "running" || r.status === "paused" || r.status === "resumed");

  const handleRolloutAction = async (rolloutId: string, action: "pause" | "resume" | "cancel", needsReason: boolean) => {
    setActionLoading(`${rolloutId}:${action}`);
    setActionError(null);
    try {
      const body = needsReason ? { reason: `Operator ${action} action` } : {};
      const json = await apiPost<{ success: boolean; error?: { message?: string } }>(`/api/platform/rollouts/${rolloutId}/${action}`, body);
      if (!json.success) {
        setActionError(json.error?.message ?? t("admin.common.actionFailed", { action }));
      } else {
        reloadRollouts();
      }
    } catch {
      setActionError(t("admin.common.actionFailed", { action }));
    } finally {
      setActionLoading(null);
    }
  };

  if (releaseLoading) {
    return <p className="text-sm text-slate-500">{t("admin.common.loading")}</p>;
  }

  if (releaseError || !release) {
    return (
      <div>
        <Link href="/admin/releases" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> {t("admin.releases.detail.backToReleases")}
        </Link>
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {releaseError ?? t("admin.releases.detail.notFound")}
        </div>
      </div>
    );
  }

  const channelBadge = RELEASE_BADGE[release.channel];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin/releases" className="hover:text-slate-700">{t("admin.nav.releases")}</Link>
        <ChevronRight size={14} />
        <span className="font-mono text-slate-700">{release.id}</span>
      </div>

      {/* Header */}
      <div className="mt-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{t("admin.releases.detail.title")}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${channelBadge.color}`}>{t(channelBadge.label)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          release.status === "active" ? "bg-emerald-100 text-emerald-700" :
          release.status === "superseded" ? "bg-slate-100 text-slate-500" :
          release.status === "paused" ? "bg-amber-100 text-amber-700" :
          "bg-red-100 text-red-700"
        }`}>
          {release.status}
        </span>
      </div>

      {actionError && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      {/* Metadata */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">{t("admin.releases.detail.metadata")}</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <MetaRow label={t("admin.releases.detail.releaseId")} value={release.id} mono />
            <MetaRow label={t("admin.releases.channel")} value={t(channelBadge.label)} />
            <MetaRow label={t("admin.common.status")} value={release.status} />
            <MetaRow label={t("admin.releases.approvedBy")} value={release.approvedBy ?? "—"} mono />
            <MetaRow label={t("admin.releases.releasedAt")} value={formatDateTime(release.releasedAt)} />
            <MetaRow label={t("admin.common.createdAt")} value={formatDateTime(release.createdAt)} />
          </dl>
          {release.releaseNotes && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold text-slate-500">{t("admin.releases.detail.releaseNotes")}</p>
              <p className="mt-1 text-sm text-slate-700">{release.releaseNotes}</p>
            </div>
          )}
        </div>

        {/* Included version */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">{t("admin.releases.detail.includedVersion")}</h3>
          {version ? (
            <div className="mt-3">
              <Link
                href={`/admin/catalog/versions/${version.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-3 transition hover:border-slate-300"
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">v{version.version}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t("admin.releases.detail.schemaVersion", { version: version.manifestSchemaVersion })}</p>
                </div>
                <ChevronRight size={18} className="text-slate-400" />
              </Link>
              {version.artifactChecksum && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-500">{t("admin.releases.detail.artifactChecksum")}</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-slate-600">{version.artifactChecksum}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{t("admin.common.loading")}</p>
          )}
        </div>
      </div>

      {/* Rollouts */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">{t("admin.releases.detail.rolloutStatus")}</h2>
          {!activeRollout && release.status === "active" && (
            <button
              onClick={() => setShowStartForm(true)}
              className="app-button-primary"
            >
              <Play size={16} /> {t("admin.releases.detail.startRollout")}
            </button>
          )}
        </div>

        {rolloutsLoading ? (
          <p className="mt-3 text-sm text-slate-500">{t("admin.common.loading")}</p>
        ) : rolloutList.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm text-slate-500">{t("admin.releases.detail.noRollouts")}</p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {rolloutList.map((rollout) => (
              <RolloutCard
                key={rollout.id}
                rollout={rollout}
                actionLoading={actionLoading}
                onPause={() => handleRolloutAction(rollout.id, "pause", true)}
                onResume={() => handleRolloutAction(rollout.id, "resume", false)}
                onCancel={() => handleRolloutAction(rollout.id, "cancel", true)}
              />
            ))}
          </div>
        )}
      </div>

      {showStartForm && (
        <StartRolloutModal
          releaseId={releaseId}
          onClose={() => setShowStartForm(false)}
          onCreated={() => { setShowStartForm(false); reloadRollouts(); }}
          onError={(msg) => setActionError(msg)}
        />
      )}
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

function RolloutCard({
  rollout,
  actionLoading,
  onPause,
  onResume,
  onCancel,
}: {
  rollout: ReleaseRollout;
  actionLoading: string | null;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const badge = ROLLOUT_STATUS_BADGE[rollout.status];
  const config = (() => { try { return JSON.parse(rollout.targetConfigJson) as Record<string, unknown>; } catch { return null; } })();

  const isActive = rollout.status === "running" || rollout.status === "resumed";
  const isPaused = rollout.status === "paused";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.color}`}>{t(badge.label)}</span>
          <span className="text-xs text-slate-500">{t("admin.common.type")}: {rollout.targetType}</span>
          <span className="text-xs text-slate-400">{formatDateTime(rollout.createdAt)}</span>
        </div>
        <Link
          href={`/admin/rollouts/${rollout.id}`}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          {t("admin.releases.detail.viewDetail")} <ChevronRight size={14} className="inline" />
        </Link>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
        <div>
          <span className="text-xs font-semibold text-slate-500">{t("admin.rollouts.successThreshold")}:</span>{" "}
          <span className="text-slate-700">{(rollout.successThreshold * 100).toFixed(0)}%</span>
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-500">{t("admin.rollouts.failureThreshold")}:</span>{" "}
          <span className="text-slate-700">{(rollout.failureThreshold * 100).toFixed(0)}%</span>
        </div>
        {config && (
          <div>
            <span className="text-xs font-semibold text-slate-500">{t("admin.rollouts.targetConfig")}:</span>{" "}
            <span className="font-mono text-xs text-slate-600">{JSON.stringify(config)}</span>
          </div>
        )}
      </div>

      {(isActive || isPaused) && (
        <div className="mt-3 flex gap-2">
          {isActive && (
            <button
              onClick={onPause}
              disabled={actionLoading === `${rollout.id}:pause`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
            >
              {actionLoading === `${rollout.id}:pause` ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
              {t("admin.common.pause")}
            </button>
          )}
          {isPaused && (
            <button
              onClick={onResume}
              disabled={actionLoading === `${rollout.id}:resume`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
            >
              {actionLoading === `${rollout.id}:resume` ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {t("admin.common.resume")}
            </button>
          )}
          <button
            onClick={onCancel}
            disabled={actionLoading === `${rollout.id}:cancel`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            {actionLoading === `${rollout.id}:cancel` ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
            {t("admin.common.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}

function StartRolloutModal({
  releaseId,
  onClose,
  onCreated,
  onError,
}: {
  releaseId: string;
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [targetType, setTargetType] = useState<"allowlist" | "percentage" | "all_eligible">("all_eligible");
  const [workspaceIds, setWorkspaceIds] = useState("");
  const [percentage, setPercentage] = useState("100");
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      const targetConfig: Record<string, unknown> = {};
      if (targetType === "allowlist") {
        targetConfig.workspaceIds = workspaceIds.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (targetType === "percentage") {
        targetConfig.percentage = Number(percentage) / 100;
      }

      const json = await apiPost<{ success: boolean; error?: { message?: string } }>(`/api/platform/releases/${releaseId}/rollout`, { targetType, targetConfig });
      if (json.success) {
        onCreated();
      } else {
        onError(json.error?.message ?? t("admin.releases.detail.startRolloutFailed"));
      }
    } catch {
      onError(t("admin.releases.detail.startRolloutFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">{t("admin.releases.detail.startRollout")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t("admin.rollouts.targetType")}</label>
            <select className="app-input" value={targetType} onChange={(e) => setTargetType(e.target.value as typeof targetType)}>
              <option value="all_eligible">{t("admin.releases.detail.allEligibleWorkspaces")}</option>
              <option value="allowlist">{t("admin.releases.detail.allowlist")}</option>
              <option value="percentage">{t("admin.releases.detail.percentage")}</option>
            </select>
          </div>
          {targetType === "allowlist" && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t("admin.releases.detail.workspaceIds")}</label>
              <input
                className="app-input"
                value={workspaceIds}
                onChange={(e) => setWorkspaceIds(e.target.value)}
                placeholder="ws_xxx, ws_yyy"
              />
            </div>
          )}
          {targetType === "percentage" && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t("admin.releases.detail.percentageLabel")}</label>
              <input
                type="number"
                min="1"
                max="100"
                className="app-input"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
              />
            </div>
          )}
        </div>

        <button onClick={handleStart} disabled={loading} className="app-button-primary mt-5 w-full">
          {loading ? t("admin.releases.detail.starting") : t("admin.releases.detail.start")}
        </button>
      </div>
    </div>
  );
}
