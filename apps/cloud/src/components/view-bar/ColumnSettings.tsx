"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";

export interface ColumnSettingsProps {
  columns: Array<{ field: string; label?: string }>;
  visibleFields: string[];
  onChange: (visibleFields: string[]) => void;
}

export default function ColumnSettings({
  columns,
  visibleFields,
  onChange,
}: ColumnSettingsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const visibleSet = new Set(visibleFields);
  const visibleCount = columns.filter((c) => visibleSet.has(c.field)).length;

  const handleToggle = (field: string) => {
    if (visibleSet.has(field)) {
      // Prevent unchecking the last visible column
      if (visibleCount <= 1) return;
      onChange(visibleFields.filter((f) => f !== field));
    } else {
      onChange([...visibleFields, field]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="app-button-ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Column settings"
      >
        <Settings2 size={16} />
      </button>
      {open && (
        <div
          role="group"
          aria-label="Visible columns"
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Columns
          </p>
          <div className="max-h-64 overflow-y-auto">
            {columns.map((col) => {
              const isVisible = visibleSet.has(col.field);
              const isDisabled = isVisible && visibleCount <= 1;
              return (
                <label
                  key={col.field}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-slate-50 ${
                    isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    disabled={isDisabled}
                    onChange={() => handleToggle(col.field)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="truncate text-slate-700">
                    {col.label ?? col.field}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
