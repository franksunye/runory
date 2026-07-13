"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowUpCircle, ChevronRight } from "lucide-react";
import {
  type CatalogRelease,
  RELEASE_BADGE,
  formatDateTime,
} from "../_components/shared";
import { apiFetch } from "@/lib/api-fetch";
import { useI18n } from "@/i18n/locale-provider";

type Filter = "all" | "internal" | "beta" | "stable";

export default function ReleasesPage() {
  const { t } = useI18n();
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?channel=${filter}` : "";
      const json = await apiFetch<{ success: boolean; data?: CatalogRelease[] }>(`/api/platform/releases${params}`, { cache: "no-store" });
      if (json.success) setReleases(json.data ?? []);
    } catch (e) {
      if (e instanceof Error && e.message.includes("403")) {
        window.location.href = "/login";
        return;
      }
      // ignore other errors
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">{t("admin.releases.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("admin.releases.description")}</p>

      <div className="mt-4 flex gap-2">
        {(["all", "internal", "beta", "stable"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f ? "bg-slate-950 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? t("admin.releases.all") : t(RELEASE_BADGE[f].label)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">{t("admin.common.loading")}</p>
      ) : releases.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <ArrowUpCircle size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">{t("admin.releases.empty")}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.releases.channel")}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.releases.status")}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.releases.versionId")}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.releases.releasedAt")}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{t("admin.releases.approvedBy")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {releases.map((release) => (
                <tr key={release.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/releases/${release.id}`} className="hover:underline">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RELEASE_BADGE[release.channel].color}`}>
                        {t(RELEASE_BADGE[release.channel].label)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      release.status === "active" ? "bg-emerald-100 text-emerald-700" :
                      release.status === "superseded" ? "bg-slate-100 text-slate-500" :
                      release.status === "paused" ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {release.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    <Link href={`/admin/catalog/versions/${release.catalogVersionId}`} className="hover:underline">
                      {release.catalogVersionId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(release.releasedAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{release.approvedBy ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/releases/${release.id}`} className="text-slate-400 hover:text-slate-700">
                      <ChevronRight size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
