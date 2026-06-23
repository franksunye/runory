"use client";

import Link from "next/link";
import type { FieldDefinition } from "@runory/platform-core";

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
}

interface ListColumn {
  field: string;
  label?: string;
}

// ── Relative time formatting ──

export function formatRelativeTime(value: string | number | boolean | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}个月前`;
  return `${Math.floor(month / 12)}年前`;
}

// ── Badge renderers for status / priority ──

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  todo: { label: "待办", className: "bg-slate-100 text-slate-700" },
  in_progress: { label: "进行中", className: "bg-blue-100 text-blue-700" },
  done: { label: "已完成", className: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "已取消", className: "bg-red-100 text-red-700" },
};

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  low: { label: "低", className: "bg-slate-100 text-slate-700" },
  medium: { label: "中", className: "bg-blue-100 text-blue-700" },
  high: { label: "高", className: "bg-orange-100 text-orange-700" },
  urgent: { label: "紧急", className: "bg-red-100 text-red-700" },
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function formatValue(value: string | number | boolean | null, type: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") return value ? "是" : "否";
  if (type === "date") {
    try {
      return new Date(String(value)).toLocaleDateString("zh-CN");
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function renderCell(
  fieldKey: string,
  value: string | number | boolean | null,
  type: string
): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-slate-400">—</span>;

  if (fieldKey === "status" && typeof value === "string") {
    const badge = STATUS_BADGES[value];
    if (badge) return <Badge label={badge.label} className={badge.className} />;
  }

  if (fieldKey === "priority" && typeof value === "string") {
    const badge = PRIORITY_BADGES[value];
    if (badge) return <Badge label={badge.label} className={badge.className} />;
  }

  if (fieldKey === "created_at" || fieldKey === "updated_at") {
    return <span title={String(value)}>{formatRelativeTime(value)}</span>;
  }

  return <>{formatValue(value, type)}</>;
}

export default function SchemaTable({
  fields,
  viewConfig,
  records,
  workspaceId,
  objectKey,
}: SchemaTableProps) {
  const fieldMap = new Map(fields.map((f) => [f.fieldKey, f]));
  const columns: ListColumn[] = viewConfig?.columns ?? [];
  const basePath = `/w/${workspaceId}/${objectKey}s`;

  if (columns.length === 0) {
    return <p className="text-sm text-slate-500">列表未配置任何列。</p>;
  }

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">暂无数据</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => {
              const fieldDef = fieldMap.get(col.field);
              const label = col.label ?? fieldDef?.label ?? col.field;
              const isExtension =
                fieldDef?.ownership === "workspace_extension";
              return (
                <th
                  key={col.field}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {isExtension && (
                      <span className="rounded bg-purple-100 px-1 text-[10px] font-medium text-purple-700">
                        扩展
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((record) => (
            <tr key={String(record.id)} className="hover:bg-slate-50">
              {columns.map((col) => {
                const fieldDef = fieldMap.get(col.field);
                const type = fieldDef?.type ?? "text";
                return (
                  <td
                    key={col.field}
                    className="whitespace-nowrap px-4 py-3 text-sm text-slate-700"
                  >
                    {renderCell(col.field, record[col.field], type)}
                  </td>
                );
              })}
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                <Link
                  href={`${basePath}/${record.id}`}
                  className="font-medium text-blue-600 hover:text-blue-800"
                >
                  查看
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
