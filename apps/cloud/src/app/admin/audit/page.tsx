"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/locale-provider";
import { useAdminFetch, formatDateTime } from "../_components/shared";

interface AuditEvent {
  id: string;
  workspaceId: string;
  action: string;
  actorType: string;
  actorId: string;
  entityType: string;
  entityId: string;
  label: string;
  createdAt: string;
}

export default function AuditPage() {
  const { t } = useI18n();
  const [action, setAction] = useState<string>("");

  const url = `/api/admin/audit?limit=200${action ? `&action=${encodeURIComponent(action)}` : ""}`;
  const { data: events, loading, error } = useAdminFetch<AuditEvent[]>(url, [
    action,
  ]);

  // Collect unique actions for the filter dropdown from loaded data
  const actionOptions = events
    ? Array.from(new Set(events.map((e) => e.action))).sort()
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {t("admin.audit.title")}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("admin.audit.description")}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600">
          {t("admin.audit.filterAction")}
        </label>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
        >
          <option value="">{t("admin.audit.allActions")}</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">{t("admin.common.loading")}</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !events || events.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">{t("admin.audit.empty")}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.audit.time")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.audit.workspace")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.audit.action")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.audit.actor")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  {t("admin.audit.entity")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Label
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(event.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {event.workspaceId}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {event.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {event.actorId}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {event.entityType}:{event.entityId}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {event.label || "—"}
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
