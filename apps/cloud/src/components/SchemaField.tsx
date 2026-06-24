"use client";

import { useEffect, useState } from "react";
import type { FieldDefinition } from "@runory/platform-core";

interface SchemaFieldProps {
  field: FieldDefinition;
  value: any;
  onChange: (value: any) => void;
  workspaceId?: string;
}

export default function SchemaField({ field, value, onChange, workspaceId }: SchemaFieldProps) {
  const baseClass =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  const renderInput = () => {
    switch (field.type) {
      case "email":
        return (
          <input
            type="email"
            className={baseClass}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`请输入${field.label}`}
          />
        );
      case "phone":
        return (
          <input
            type="tel"
            className={baseClass}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`请输入${field.label}`}
          />
        );
      case "number":
        return (
          <input
            type="number"
            className={baseClass}
            value={value ?? ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            placeholder={`请输入${field.label}`}
          />
        );
      case "date":
        return (
          <input
            type="date"
            className={baseClass}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "boolean":
        return (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
        );
      case "select": {
        const options =
          (field.validation?.options as string[] | undefined) ?? [];
        return (
          <select
            className={baseClass}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">请选择</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      }
      case "lookup": {
        const targetObject =
          (field.validation?.targetObject as string | undefined) ?? "";
        return (
          <LookupField
            workspaceId={workspaceId}
            targetObject={targetObject}
            value={value}
            onChange={onChange}
            placeholder={`请选择${field.label}`}
          />
        );
      }
      case "text":
      default:
        return (
          <input
            type="text"
            className={baseClass}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`请输入${field.label}`}
          />
        );
    }
  };

  return (
    <div className={field.type === "boolean" ? "flex items-center gap-2" : ""}>
      {renderInput()}
    </div>
  );
}

// ── Lookup Field (v0.3.2) ──
// Renders a searchable select that fetches candidate records from the target
// object and stores the selected record's id. Falls back to a plain text input
// when workspaceId or targetObject is unavailable.

function LookupField({
  workspaceId,
  targetObject,
  value,
  onChange,
  placeholder,
}: {
  workspaceId?: string;
  targetObject: string;
  value: any;
  onChange: (value: any) => void;
  placeholder: string;
}) {
  const [options, setOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!workspaceId || !targetObject) return;
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/workspaces/${workspaceId}/objects/${targetObject}/records?search=${encodeURIComponent(search)}&limit=20`
    )
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          setOptions(
            json.data.map((r: Record<string, unknown>) => ({
              id: String(r.id),
              label: String(r.name ?? r.title ?? r.id),
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, targetObject, search]);

  if (!workspaceId || !targetObject) {
    return (
      <input
        type="text"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="space-y-1">
      {value && (
        <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
          <span className="text-slate-700">
            {options.find((o) => o.id === String(value))?.label ?? String(value)}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-slate-400 hover:text-red-600"
          >
            清除
          </button>
        </div>
      )}
      <input
        type="search"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索以选择..."
      />
      {loading && <p className="text-xs text-slate-400">加载中...</p>}
      {!loading && options.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setSearch("");
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-blue-50"
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && options.length === 0 && search && (
        <p className="text-xs text-slate-400">未找到匹配记录</p>
      )}
    </div>
  );
}
