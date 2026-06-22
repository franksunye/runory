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
                    {formatValue(record[col.field], type)}
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
