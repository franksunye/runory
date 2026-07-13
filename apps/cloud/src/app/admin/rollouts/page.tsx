"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import {
  useAdminFetch,
  formatDateTime,
  ROLLOUT_STATUS_BADGE,
  type ReleaseRollout,
} from "../_components/shared";

export default function RolloutsPage() {
  const { t } = useI18n();
  const { data: rollouts, loading, error } = useAdminFetch<ReleaseRollout[]>(
    "/api/admin/rollouts"
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {t("admin.rollouts.title")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("admin.rollouts.description")}
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">加载中...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !rollouts || rollouts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">{t("admin.rollouts.empty")}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.rollouts.id")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.rollouts.releaseId")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.rollouts.targetType")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.rollouts.startedBy")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.rollouts.startedAt")}
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rollouts.map((rollout) => (
                <tr key={rollout.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/rollouts/${rollout.id}`}
                      className="font-mono text-xs text-slate-600 hover:underline"
                    >
                      {rollout.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {rollout.catalogReleaseId}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {rollout.targetType}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLLOUT_STATUS_BADGE[rollout.status].color}`}
                    >
                      {ROLLOUT_STATUS_BADGE[rollout.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {rollout.startedBy ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(rollout.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/rollouts/${rollout.id}`}
                      className="text-slate-400 hover:text-slate-700"
                    >
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
