"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";
import type { FieldDefinition } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { objectKeyToRouteSegment } from "@/lib/dynamic-object";

type RecordData = Record<string, string | number | boolean | null>;
type ViewConfig = {
  columns?: Array<{ field: string; label?: string }>;
  sections?: Array<{ title: string; fields: Array<{ field: string; required?: boolean }> }>;
};

interface SchemaTableProps {
  fields: FieldDefinition[];
  viewConfig: ViewConfig;
  records: RecordData[];
  workspaceId: string;
  objectKey: string;
  basePath?: string;
}

interface ListColumn {
  field: string;
  label?: string;
}

type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

// ── Relative time formatting ──

export function formatRelativeTime(
  value: string | number | boolean | null,
  t?: TFunc
): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return t ? t("workspace.table.justNow") : "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return t ? t("workspace.table.minutesAgo", { min }) : `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return t ? t("workspace.table.hoursAgo", { hr }) : `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return t ? t("workspace.table.daysAgo", { day }) : `${day} d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return t ? t("workspace.table.monthsAgo", { month }) : `${month} mo ago`;
  const years = Math.floor(month / 12);
  return t ? t("workspace.table.yearsAgo", { years }) : `${years} yr ago`;
}

// ── Badge renderer ──

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_LABEL_KEY: Record<string, MessageKey> = {
  todo: "workspace.table.statusTodo",
  in_progress: "workspace.table.statusInProgress",
  done: "workspace.table.statusDone",
  cancelled: "workspace.table.statusCancelled",
};

const PRIORITY_LABEL_KEY: Record<string, MessageKey> = {
  low: "workspace.table.priorityLow",
  medium: "workspace.table.priorityMedium",
  high: "workspace.table.priorityHigh",
  urgent: "workspace.table.priorityUrgent",
};

function formatValue(
  value: string | number | boolean | null,
  type: string,
  t: TFunc,
  locale?: string
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") return value ? t("workspace.yes") : t("workspace.no");
  if (type === "date") {
    try {
      return new Date(String(value)).toLocaleDateString(locale ?? undefined);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function renderCell(
  fieldKey: string,
  value: string | number | boolean | null,
  type: string,
  t: TFunc,
  locale?: string,
  displayValue?: string | null,
  targetObject?: string,
  workspaceId?: string
): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-slate-400">—</span>;

  if (fieldKey === "status" && typeof value === "string") {
    const className = STATUS_BADGE_CLASS[value];
    const labelKey = STATUS_LABEL_KEY[value];
    if (className && labelKey) return <Badge label={t(labelKey)} className={className} />;
  }

  if (fieldKey === "priority" && typeof value === "string") {
    const className = PRIORITY_BADGE_CLASS[value];
    const labelKey = PRIORITY_LABEL_KEY[value];
    if (className && labelKey) return <Badge label={t(labelKey)} className={className} />;
  }

  if (fieldKey === "created_at" || fieldKey === "updated_at") {
    return <span title={String(value)}>{formatRelativeTime(value, t)}</span>;
  }

  if (type === "user" && displayValue) {
    return <span className="font-medium text-slate-800">{displayValue}</span>;
  }

  // For lookup fields, render the display label as a link to the referenced record
  if (type === "lookup" && displayValue) {
    if (targetObject && workspaceId) {
      const routeSegment = objectKeyToRouteSegment(targetObject);
      const href = `/w/${workspaceId}/${routeSegment}/${value}`;
      return (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-indigo-600 hover:text-indigo-800"
        >
          {displayValue}
        </Link>
      );
    }
    return <>{displayValue}</>;
  }

  return <>{formatValue(value, type, t, locale)}</>;
}

export default function SchemaTable({
  fields,
  viewConfig,
  records,
  workspaceId,
  objectKey,
  basePath,
}: SchemaTableProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const fieldMap = new Map(fields.map((f) => [f.fieldKey, f]));
  const columns: ListColumn[] = viewConfig?.columns ?? [];
  const linkBase = basePath ?? `/w/${workspaceId}/${objectKey}s`;

  if (columns.length === 0) {
    return <p className="text-sm text-slate-500">{t("workspace.table.noColumns")}</p>;
  }

  if (records.length === 0) {
    return (
      <div className="app-card flex flex-col items-center px-6 py-12 text-center">
        <Inbox size={28} className="text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">{t("workspace.table.noData")}</p>
      </div>
    );
  }

  return (
    <div className="app-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50/80">
            <tr>
              {columns.map((col) => {
                const fieldDef = fieldMap.get(col.field);
                const label = col.label ?? fieldDef?.label ?? col.field;
                const isExtension =
                  fieldDef?.ownership === "workspace_extension";
                return (
                  <th
                    key={col.field}
                    className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {isExtension && (
                        <span className="rounded bg-purple-100 px-1 text-[10px] font-medium text-purple-700">
                          {t("workspace.extension")}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {records.map((record) => {
              const href = `${linkBase}/${record.id}`;
              return (
                <tr
                  key={String(record.id)}
                  onClick={() => router.push(href)}
                  className="cursor-pointer transition hover:bg-indigo-50/40"
                >
                  {columns.map((col) => {
                    const fieldDef = fieldMap.get(col.field);
                    const type = fieldDef?.type ?? "text";
                    const displayKey = `${col.field}_display`;
                    const displayValue = (record as Record<string, unknown>)[displayKey] as string | null | undefined;
                    const targetObject = fieldDef?.validation?.targetObject as string | undefined;
                    return (
                      <td
                        key={col.field}
                        className="whitespace-nowrap px-4 py-3 text-sm text-slate-700"
                      >
                        {renderCell(col.field, record[col.field], type, t, locale, displayValue, targetObject, workspaceId)}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                    <span className="text-xs font-semibold text-indigo-600 group-hover:text-indigo-800">
                      {t("workspace.table.view")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
