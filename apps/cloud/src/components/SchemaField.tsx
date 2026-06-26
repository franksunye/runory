"use client";

import { useEffect, useState } from "react";
import type { FieldDefinition } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";

interface SchemaFieldProps {
  field: FieldDefinition;
  value: any;
  onChange: (value: any) => void;
  workspaceId?: string;
  /** When true, the field renders as read-only static text with a badge. */
  readOnly?: boolean;
  /** Optional reason text shown in the badge when readOnly. */
  readOnlyReason?: string;
}

export default function SchemaField({ field, value, onChange, workspaceId, readOnly, readOnlyReason }: SchemaFieldProps) {
  const { t } = useI18n();
  const baseClass = "app-input";

  const enterPlaceholder = t("workspace.field.enterPlaceholder", { label: field.label });

  // Read-only mode: render as static text with a badge
  if (readOnly) {
    const displayValue =
      field.type === "boolean"
        ? value
          ? t("workspace.yes")
          : t("workspace.no")
        : value === null || value === undefined || value === ""
          ? "—"
          : String(value);
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="font-medium">{displayValue}</span>
        </div>
        {readOnlyReason && (
          <p className="flex items-center gap-1 text-xs text-indigo-600">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {readOnlyReason}
          </p>
        )}
      </div>
    );
  }

  const renderInput = () => {
    switch (field.type) {
      case "email":
        return (
          <input
            type="email"
            className={baseClass}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={enterPlaceholder}
          />
        );
      case "phone":
        return (
          <input
            type="tel"
            className={baseClass}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={enterPlaceholder}
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
            placeholder={enterPlaceholder}
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
            <option value="">{t("workspace.field.selectPlaceholder")}</option>
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
            placeholder={t("workspace.field.lookupPlaceholder", { label: field.label })}
            t={t}
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
            placeholder={enterPlaceholder}
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

type TFunc = (key: import("@/i18n/messages").MessageKey, params?: Record<string, string | number>) => string;

function LookupField({
  workspaceId,
  targetObject,
  value,
  onChange,
  placeholder,
  t,
}: {
  workspaceId?: string;
  targetObject: string;
  value: any;
  onChange: (value: any) => void;
  placeholder: string;
  t: TFunc;
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
              label: String(
                r.name ?? r.title ?? r.subject ?? r.summary ??
                r.number ?? r.code ?? r.email ?? r.label ?? r.id
              ),
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
        className="app-input"
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
            {t("workspace.field.clear")}
          </button>
        </div>
      )}
      <input
        type="search"
        className="app-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("workspace.field.searchToSelect")}
      />
      {loading && <p className="text-xs text-slate-400">{t("workspace.loading")}</p>}
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
        <p className="text-xs text-slate-400">{t("workspace.field.noMatchFound")}</p>
      )}
    </div>
  );
}
