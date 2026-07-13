"use client";

import { useI18n } from "@/i18n/locale-provider";
import { useAdminFetch, formatDateTime } from "../_components/shared";

interface AppliedMigration {
  filename: string;
  appliedAt: string | null;
  checksum: string | null;
}

interface PendingMigration {
  filename: string;
}

interface MigrationsData {
  applied: AppliedMigration[];
  pending: PendingMigration[];
}

export default function MigrationsPage() {
  const { t } = useI18n();
  const { data, loading, error } = useAdminFetch<MigrationsData>(
    "/api/admin/migrations"
  );

  const applied = data?.applied ?? [];
  const pending = data?.pending ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {t("admin.migrations.title")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("admin.migrations.description")}
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">加载中...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : applied.length === 0 && pending.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            {t("admin.migrations.empty")}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {/* Applied Migrations */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              {t("admin.migrations.applied")}
            </h2>
            {applied.length === 0 ? (
              <p className="text-sm text-slate-400">
                {t("admin.migrations.empty")}
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">
                        {t("admin.migrations.filename")}
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">
                        {t("admin.migrations.appliedAt")}
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">
                        {t("admin.migrations.checksum")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {applied.map((migration) => (
                      <tr key={migration.filename} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {migration.filename}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatDateTime(migration.appliedAt)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">
                          {migration.checksum ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pending Migrations */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              {t("admin.migrations.pending")}
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-slate-400">
                {t("admin.migrations.empty")}
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">
                        {t("admin.migrations.filename")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pending.map((migration) => (
                      <tr key={migration.filename} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {migration.filename}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
