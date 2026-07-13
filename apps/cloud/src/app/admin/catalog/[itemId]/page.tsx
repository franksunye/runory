"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Package } from "lucide-react";
import {
  type CatalogItem,
  type CatalogVersion,
  type CatalogRelease,
  ITEM_TYPE_BADGE,
  LIFECYCLE_BADGE,
  RELEASE_BADGE,
  formatDateTime,
  useAdminFetch,
} from "../../_components/shared";
import { useI18n } from "@/i18n/locale-provider";

export default function CatalogItemDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ itemId: string }>();
  const itemId = params.itemId;

  const { data: item, loading: itemLoading, error: itemError } = useAdminFetch<CatalogItem>(
    `/api/platform/catalog/${itemId}`
  );
  const { data: versions, loading: versionsLoading, error: versionsError } = useAdminFetch<CatalogVersion[]>(
    `/api/platform/catalog/${itemId}/versions`
  );
  const { data: releases, loading: releasesLoading } = useAdminFetch<CatalogRelease[]>(
    `/api/platform/releases`
  );

  const loading = itemLoading || versionsLoading || releasesLoading;

  if (loading) {
    return <p className="text-sm text-slate-500">{t("admin.common.loading")}</p>;
  }

  if (itemError || !item) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {itemError ?? t("admin.catalog.detail.itemNotFound")}
        </div>
      </div>
    );
  }

  const versionList = versions ?? [];
  const releaseList = releases ?? [];

  // Find stable and beta releases for this item's versions
  const versionIds = new Set(versionList.map((v) => v.id));
  const itemReleases = releaseList.filter((r) => versionIds.has(r.catalogVersionId));
  const stableRelease = itemReleases.find((r) => r.channel === "stable" && r.status === "active");
  const betaRelease = itemReleases.find((r) => r.channel === "beta" && r.status === "active");

  const getReleasesForVersion = (versionId: string) =>
    itemReleases.filter((r) => r.catalogVersionId === versionId);

  return (
    <div>
      <BackLink />

      {/* Header */}
      <div className="mt-4 flex items-center gap-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ITEM_TYPE_BADGE[item.itemType].color}`}>
          {t(ITEM_TYPE_BADGE[item.itemType].label)}
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{item.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {item.status}
        </span>
      </div>

      {/* Metadata */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaCard label={t("admin.catalog.itemType")} value={t(ITEM_TYPE_BADGE[item.itemType].label)} />
        <MetaCard label={t("admin.catalog.visibility")} value={item.visibility} />
        <MetaCard label={t("admin.catalog.detail.publisher")} value={item.publisherId} mono />
        <MetaCard label={t("admin.common.createdAt")} value={formatDateTime(item.createdAt)} />
      </div>

      {item.description && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("admin.common.description")}</p>
          <p className="mt-1 text-sm text-slate-700">{item.description}</p>
        </div>
      )}

      {/* Prominent current releases */}
      {(stableRelease || betaRelease) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {stableRelease && (
            <ProminentReleaseCard
              label={t("admin.catalog.detail.currentStable")}
              release={stableRelease}
              version={versionList.find((v) => v.id === stableRelease.catalogVersionId)}
            />
          )}
          {betaRelease && (
            <ProminentReleaseCard
              label={t("admin.catalog.detail.currentBeta")}
              release={betaRelease}
              version={versionList.find((v) => v.id === betaRelease.catalogVersionId)}
            />
          )}
        </div>
      )}

      {/* Versions list */}
      <h2 className="mt-8 text-lg font-bold text-slate-950">{t("admin.catalog.detail.versions")}</h2>

      {versionsError && (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{versionsError}</div>
      )}

      {versionList.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Package size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">{t("admin.catalog.detail.noVersions")}</p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {versionList.map((version) => {
            const badge = LIFECYCLE_BADGE[version.lifecycleStatus];
            const versionReleases = getReleasesForVersion(version.id);
            return (
              <Link
                key={version.id}
                href={`/admin/catalog/versions/${version.id}`}
                className="block rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-slate-900">v{version.version}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.color}`}>
                      <badge.icon size={12} /> {t(badge.label)}
                    </span>
                    {versionReleases.map((rel) => (
                      <span key={rel.id} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RELEASE_BADGE[rel.channel].color}`}>
                        {t(RELEASE_BADGE[rel.channel].label)} · {rel.status}
                      </span>
                    ))}
                    {version.frozenAt && (
                      <span className="text-xs text-slate-400">{t("admin.catalog.detail.frozenAt")} {formatDateTime(version.frozenAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{formatDateTime(version.createdAt)}</span>
                    <ChevronRight size={18} className="text-slate-400" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BackLink() {
  const { t } = useI18n();
  return (
    <Link href="/admin?tab=catalog" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
      <ArrowLeft size={15} /> {t("admin.catalog.detail.backToCatalog")}
    </Link>
  );
}

function MetaCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-sm text-slate-700 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function ProminentReleaseCard({
  label,
  release,
  version,
}: {
  label: string;
  release: CatalogRelease;
  version?: CatalogVersion;
}) {
  const { t } = useI18n();
  const badge = RELEASE_BADGE[release.channel];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.color}`}>{t(badge.label)}</span>
      </div>
      <p className="mt-2 font-mono text-lg font-bold text-slate-950">
        {version ? `v${version.version}` : "—"}
      </p>
      <div className="mt-2 space-y-1 text-xs text-slate-500">
        <p>{t("admin.common.status")}: {release.status}</p>
        <p>{t("admin.releases.releasedAt")}: {formatDateTime(release.releasedAt)}</p>
        {release.approvedBy && <p>{t("admin.releases.approvedBy")}: <span className="font-mono">{release.approvedBy}</span></p>}
      </div>
      <Link
        href={`/admin/releases/${release.id}`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-950"
      >
        {t("admin.catalog.detail.viewReleaseDetail")} <ChevronRight size={14} />
      </Link>
    </div>
  );
}
