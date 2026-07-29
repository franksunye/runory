"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarDays,
  Check,
  Hash,
  Link2,
  ListFilter,
  Search,
  ToggleLeft,
  Type,
  X,
} from "lucide-react";

export interface SortField {
  field: string;
  label: string;
  type?: string;
}

export interface SortPickerLabels {
  title: string;
  ascending: string;
  descending: string;
  searchFields: string;
  fields: string;
  noFields: string;
  close: string;
}

export interface SortPickerProps {
  fields: SortField[];
  field: string;
  direction: "asc" | "desc";
  onChange: (field: string, direction: "asc" | "desc") => void;
  labels: SortPickerLabels;
}

function FieldIcon({ type }: { type?: string }) {
  const iconProps = { size: 15, strokeWidth: 1.8 };
  if (type === "number" || type === "currency") return <Hash {...iconProps} />;
  if (type === "date" || type === "datetime") return <CalendarDays {...iconProps} />;
  if (type === "boolean") return <ToggleLeft {...iconProps} />;
  if (type === "select" || type === "multiselect") return <ListFilter {...iconProps} />;
  if (type === "lookup" || type === "relation") return <Link2 {...iconProps} />;
  return <Type {...iconProps} />;
}

export default function SortPicker({
  fields,
  field,
  direction,
  onChange,
  labels,
}: SortPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedField = fields.find((item) => item.field === field)
    ?? (field ? { field, label: field } : fields[0]);
  const filteredFields = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return fields;
    return fields.filter((item) =>
      `${item.label} ${item.field}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [fields, query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const setDirection = (nextDirection: "asc" | "desc") => {
    if (!selectedField || nextDirection === direction) return;
    onChange(selectedField.field, nextDirection);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen((value) => !value);
        }}
        className={`app-button-ghost min-w-0 max-w-[220px] gap-2 px-3 ${open ? "bg-slate-100 text-slate-900" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.title}
      >
        {direction === "asc" ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
        <span className="truncate">{selectedField?.label ?? labels.title}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={labels.title}
          className="absolute right-0 top-full z-50 mt-1 w-[300px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-900">{labels.title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={labels.close}
            >
              <X size={15} />
            </button>
          </div>

          <div className="p-2.5">
            <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1" aria-label={labels.title}>
              {(["asc", "desc"] as const).map((option) => {
                const active = direction === option;
                const optionLabel = option === "asc" ? labels.ascending : labels.descending;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDirection(option)}
                    aria-pressed={active}
                    className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition ${
                      active
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {option === "asc" ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
                    {optionLabel}
                  </button>
                );
              })}
            </div>

            <div className="relative mt-2.5">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.searchFields}
                className="app-input h-9 pl-8 text-sm"
              />
            </div>
          </div>

          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">
            {labels.fields}
          </p>
          <div className="max-h-64 overflow-y-auto px-1.5 pb-1.5">
            {filteredFields.length ? filteredFields.map((item) => {
              const active = item.field === field;
              return (
                <button
                  key={item.field}
                  type="button"
                  onClick={() => {
                    onChange(item.field, direction);
                    setOpen(false);
                  }}
                  className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition ${
                    active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="text-slate-400"><FieldIcon type={item.type} /></span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {active ? <Check size={15} className="shrink-0 text-indigo-600" /> : null}
                </button>
              );
            }) : (
              <p className="px-2.5 py-5 text-center text-sm text-slate-400">{labels.noFields}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
