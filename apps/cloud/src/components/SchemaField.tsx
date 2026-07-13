"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FieldDefinition } from "@runory/platform-core";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch } from "@/lib/api-fetch";

interface SchemaFieldProps {
  field: FieldDefinition;
  value: any;
  /** Human-readable label already returned with a stored reference value. */
  displayValue?: string | null;
  onChange: (value: any) => void;
  workspaceId?: string;
  /** Current form values let metadata-driven lookups apply cascade filters. */
  formValues?: Record<string, unknown>;
  /** When true, the field renders as read-only static text with a badge. */
  readOnly?: boolean;
  /** Optional reason text shown in the badge when readOnly. */
  readOnlyReason?: string;
}

export default function SchemaField({ field, value, displayValue, onChange, workspaceId, formValues, readOnly, readOnlyReason }: SchemaFieldProps) {
  const { t } = useI18n();
  const baseClass = "app-input";

  const enterPlaceholder = t("workspace.field.enterPlaceholder", { label: field.label });
  const lookupFilters = useMemo(() => Array.isArray(field.validation?.lookupFilters)
    ? field.validation.lookupFilters
        .filter((filter): filter is { field: string; targetField: string } =>
          typeof filter === "object" && filter !== null &&
          typeof (filter as Record<string, unknown>).field === "string" &&
          typeof (filter as Record<string, unknown>).targetField === "string"
        )
        .map((filter) => ({ ...filter, value: formValues?.[filter.field] }))
    : [], [field.validation?.lookupFilters, formValues]);

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
            value={toDateInputValue(value)}
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
            initialLabel={displayValue}
            onChange={onChange}
            placeholder={t("workspace.field.lookupPlaceholder", { label: field.label })}
            filters={lookupFilters}
            t={t}
          />
        );
      }
      case "user":
        return (
          <LookupField
            workspaceId={workspaceId}
            targetObject="__people"
            value={value}
            initialLabel={displayValue}
            onChange={onChange}
            placeholder={t("workspace.field.lookupPlaceholder", { label: field.label })}
            filters={EMPTY_LOOKUP_FILTERS}
            t={t}
          />
        );
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
type LookupOption = { id: string; label: string };
const EMPTY_LOOKUP_FILTERS: Array<{ field: string; targetField: string; value: unknown }> = [];

/**
 * Native date inputs only accept an ISO calendar date. Records can contain a
 * full timestamp (for example schedule commands persist an ISO instant), which
 * browsers otherwise render as an empty date field without reporting an error.
 */
function toDateInputValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value);
  const calendarDate = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return calendarDate ?? "";
}

function toLookupOption(record: Record<string, unknown>): LookupOption {
  return {
    id: String(record.id),
    label: String(record.displayName ?? record.name ?? record.title ?? record.subject ?? record.summary ?? record.number ?? record.code ?? record.email ?? record.label ?? record.id),
  };
}

function LookupField({
  workspaceId,
  targetObject,
  value,
  initialLabel,
  onChange,
  placeholder,
  t,
  filters,
}: {
  workspaceId?: string;
  targetObject: string;
  value: any;
  initialLabel?: string | null;
  onChange: (value: any) => void;
  placeholder: string;
  t: TFunc;
  filters: Array<{ field: string; targetField: string; value: unknown }>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const resultsId = useId();
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Keep the selected record name independent from the transient search list.
  useEffect(() => {
    if (!workspaceId || !targetObject) return;
    if (!value) {
      setSelectedLabel("");
      return;
    }
    let cancelled = false;
    setSelectedLabel(initialLabel ?? String(value));
    const isPeopleLookup = targetObject === "__people";
    const selectedUrl = isPeopleLookup
      ? `/api/workspaces/${workspaceId}/people`
      : `/api/workspaces/${workspaceId}/objects/${targetObject}/records/${encodeURIComponent(String(value))}`;
    apiFetch<{ success: boolean; data?: Record<string, unknown> | Array<Record<string, unknown>> }>(selectedUrl).then((json) => {
      if (cancelled || !json.success || !json.data) return;
      const selected = Array.isArray(json.data)
        ? json.data.find((item) => String(item.id) === String(value))
        : json.data;
      if (selected) setSelectedLabel(toLookupOption(selected).label);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [workspaceId, targetObject, value, initialLabel]);

  useEffect(() => {
    if (!open || !workspaceId || !targetObject) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ search, limit: "20" });
      for (const filter of filters) {
        if (filter.value !== null && filter.value !== undefined && filter.value !== "") {
          params.set(`filter.${filter.targetField}`, String(filter.value));
        }
      }
      const optionsUrl = targetObject === "__people"
        ? `/api/workspaces/${workspaceId}/people`
        : `/api/workspaces/${workspaceId}/objects/${targetObject}/records?${params.toString()}`;
      apiFetch<{ success: boolean; data?: Array<Record<string, unknown>> }>(
        optionsUrl
      ).then((json) => {
        if (!cancelled) {
          const normalized = json.success && Array.isArray(json.data) ? json.data.map(toLookupOption) : [];
          const needle = search.trim().toLowerCase();
          setOptions(needle ? normalized.filter((option) => option.label.toLowerCase().includes(needle)) : normalized);
        }
      }).catch(() => {
        if (!cancelled) setOptions([]);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [workspaceId, targetObject, search, open, filters]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const choose = (option: LookupOption) => {
    setSelectedLabel(option.label);
    onChange(option.id);
    setSearch("");
    setOpen(false);
    setActiveIndex(-1);
  };

  if (!workspaceId || !targetObject) {
    return (
      <input
        type="text"
        className="app-input"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="search"
          className="app-input pr-20"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={resultsId}
          value={open ? search : selectedLabel}
          onFocus={() => { setOpen(true); setSearch(""); }}
          onChange={(event) => { setSearch(event.target.value); setOpen(true); setActiveIndex(-1); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, options.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && open && activeIndex >= 0 && options[activeIndex]) {
              event.preventDefault();
              choose(options[activeIndex]);
            } else if (event.key === "Escape") {
              setOpen(false);
              setSearch("");
              setActiveIndex(-1);
            }
          }}
          placeholder={placeholder}
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(null); setSearch(""); setSelectedLabel(""); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-red-600"
          >
            {t("workspace.field.clear")}
          </button>
        )}
      </div>
      {open && (
        <div id={resultsId} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-400">{t("workspace.loading")}</p>
          ) : options.length > 0 ? (
            options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === String(value)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                className={`block w-full px-3 py-2 text-left text-sm text-slate-700 ${index === activeIndex ? "bg-indigo-50 text-indigo-900" : "hover:bg-slate-50"}`}
              >
                {option.label}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-slate-400">{t("workspace.field.noMatchFound")}</p>
          )}
        </div>
      )}
    </div>
  );
}
