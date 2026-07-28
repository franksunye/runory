"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FieldDefinition } from "@runory/platform-core";
import type { ViewAction } from "@runory/contracts";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { objectKeyToRouteSegment } from "@/lib/dynamic-object";
import { FieldDisplay } from "@/components/fields";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import UserAvatar from "./UserAvatar";

type RecordData = Record<string, string | number | boolean | null>;
type ViewConfig = {
  columns?: Array<{ field: string; label?: string; width?: "sm" | "md" | "lg" }>;
  actions?: ViewAction[];
  sections?: Array<{ title: string; fields: Array<{ field: string; required?: boolean }> }>;
};

interface SchemaTableProps {
  fields: FieldDefinition[];
  viewConfig: ViewConfig;
  records: RecordData[];
  workspaceId: string;
  objectKey: string;
  basePath?: string;
  embedded?: boolean;
  /** When true, renders a shared loading skeleton in place of the table body. */
  loading?: boolean;
  /** When true, renders a shared error state instead of the table body. */
  error?: boolean;
  /** When provided, the error state exposes a retry action bound to this handler. */
  onRetry?: () => void;
}

interface ListColumn {
  field: string;
  label?: string;
}

type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

// ── Relative time formatting ──

export function formatRelativeTime(
  value: string | number | boolean | null | undefined,
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

// ── Neutral value formatting (fallback when field metadata is unavailable) ──

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
  field: FieldDefinition | undefined,
  t: TFunc,
  locale: string,
  displayValue?: string | null,
  targetObject?: string,
  workspaceId?: string
): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400">—</span>;
  }

  // Page-level display preference: relative time for audit timestamp fields.
  // This stays a pre-FieldDisplay check because relative time is a list-level
  // display choice, not a behavior owned by a field type renderer.
  if (fieldKey === "created_at" || fieldKey === "updated_at") {
    return <span title={String(value)}>{formatRelativeTime(value, t)}</span>;
  }

  // If the field metadata is missing (e.g. a view column referencing an unknown
  // field), fall back to a neutral text render. FieldDisplay requires a full
  // FieldDefinition, so we lean on the legacy formatValue helper here.
  if (!field) {
    return <span className="text-slate-700">{formatValue(value, "text", t, locale)}</span>;
  }

  // Lookup: render the display label via FieldDisplay and wrap it in a Link to
  // the referenced record when an authorized internal route is available.
  if (field.type === "lookup") {
    const rendered = (
      <FieldDisplay
        field={field}
        value={value}
        displayValue={displayValue ?? undefined}
        locale={locale}
      />
    );
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
          {rendered}
        </Link>
      );
    }
    return rendered;
  }

  return (
    <FieldDisplay
      field={field}
      value={value}
      displayValue={displayValue ?? undefined}
      locale={locale}
    />
  );
}

/** Resolves the cell content for a single column of a single record. */
function buildCell(
  record: RecordData,
  col: ListColumn,
  fieldMap: Map<string, FieldDefinition>,
  t: TFunc,
  locale: string,
  workspaceId: string,
): { fieldDef: FieldDefinition | undefined; label: string; content: React.ReactNode; isExtension: boolean } {
  const fieldDef = fieldMap.get(col.field);
  const label = col.label ?? fieldDef?.label ?? col.field;
  const isExtension = fieldDef?.ownership === "workspace_extension";
  const displayKey = `${col.field}_display`;
  const displayValue = (record as Record<string, unknown>)[displayKey] as string | null | undefined;
  const targetObject = fieldDef?.validation?.targetObject as string | undefined;
  const avatarUrl = (
    (record as Record<string, unknown>).avatar_url
    ?? (record as Record<string, unknown>).user_id_avatar_url
  ) as string | null | undefined;

  const cell = renderCell(
    col.field,
    record[col.field],
    fieldDef,
    t,
    locale,
    displayValue,
    targetObject,
    workspaceId,
  );

  // Attach avatar to the "name" column when available — same as the desktop table.
  const content =
    col.field === "name" && avatarUrl ? (
      <span className="flex items-center gap-2.5">
        <UserAvatar name={String(record.name ?? "")} avatarUrl={avatarUrl} size="sm" />
        <span>{cell}</span>
      </span>
    ) : (
      cell
    );

  return { fieldDef, label, content, isExtension };
}

export default function SchemaTable({
  fields,
  viewConfig,
  records,
  workspaceId,
  objectKey,
  basePath,
  embedded = false,
  loading = false,
  error = false,
  onRetry,
}: SchemaTableProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const fieldMap = new Map(fields.map((f) => [f.fieldKey, f]));
  const columns: ListColumn[] = viewConfig?.columns ?? [];
  const linkBase = basePath ?? `/w/${workspaceId}/${objectKey}s`;

  if (columns.length === 0) {
    return <p className="text-sm text-slate-500">{t("workspace.table.noColumns")}</p>;
  }

  if (loading) {
    return <LoadingState variant="table" rows={6} columns={columns.length} />;
  }

  if (error) {
    return (
      <div className={embedded ? "border-t border-slate-100" : "app-card overflow-hidden p-0"}>
        <ErrorState
          title={t("surface.error.title")}
          description={t("surface.error.description")}
          retryAction={
            onRetry
              ? { label: t("surface.error.retry"), onClick: onRetry }
              : undefined
          }
        />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className={embedded ? "border-t border-slate-100" : "app-card overflow-hidden p-0"}>
        <EmptyState title={t("workspace.table.noData")} />
      </div>
    );
  }

  const containerClass = embedded
    ? "overflow-hidden border-t border-slate-100"
    : "app-card overflow-hidden p-0";

  return (
    <div className={containerClass}>
      {/* Desktop table (sm+) */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50/80">
            <tr>
              {columns.map((col) => {
                const fieldDef = fieldMap.get(col.field);
                const label = col.label ?? fieldDef?.label ?? col.field;
                const isExtension = fieldDef?.ownership === "workspace_extension";
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
                    const { content } = buildCell(record, col, fieldMap, t, locale, workspaceId);
                    return (
                      <td
                        key={col.field}
                        className="whitespace-nowrap px-4 py-3 text-sm text-slate-700"
                      >
                        {content}
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

      {/* Mobile card list (below sm) — reuses the same columns, FieldDisplay, and record URL */}
      <div className="divide-y divide-slate-100 sm:hidden">
        {records.map((record) => {
          const href = `${linkBase}/${record.id}`;
          const cells = columns.map((col) =>
            buildCell(record, col, fieldMap, t, locale, workspaceId),
          );
          const [titleCell, ...restCells] = cells;

          return (
            <button
              key={String(record.id)}
              type="button"
              onClick={() => router.push(href)}
              className="block w-full px-4 py-3 text-left transition hover:bg-indigo-50/40"
            >
              {/* Title row: first column value rendered prominently */}
              {titleCell && (
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                    {titleCell.content}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-indigo-600">
                    {t("workspace.table.view")}
                  </span>
                </div>
              )}
              {/* Remaining fields as label/value pairs */}
              {restCells.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {restCells.map((c, i) => (
                    <div key={columns[i + 1]?.field ?? i} className="min-w-0">
                      <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {c.label}
                        {c.isExtension && (
                          <span className="ml-1 rounded bg-purple-100 px-1 text-[9px] font-medium text-purple-700">
                            {t("workspace.extension")}
                          </span>
                        )}
                      </dt>
                      <dd className="truncate text-xs text-slate-700">{c.content}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
