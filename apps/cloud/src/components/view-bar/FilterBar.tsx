"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, X, Plus } from "lucide-react";
import type { FieldDefinition } from "@runory/platform-core";

export interface FilterBarProps {
  fields: FieldDefinition[];
  activeFilters: Record<string, string>;
  onRemoveFilter: (field: string) => void;
  onAddFilter: (field: string, value: string) => void;
  workspaceId: string;
  objectKey: string;
}

interface SelectOption {
  value: string;
  label: string;
}

/** Extract select options from a field's validation config. */
function getSelectOptions(field: FieldDefinition): SelectOption[] {
  if (!field.validation) return [];
  const options = field.validation.options;
  if (!Array.isArray(options)) return [];
  return options as SelectOption[];
}

function fieldLabelFor(fields: FieldDefinition[], fieldKey: string): string {
  return fields.find((f) => f.fieldKey === fieldKey)?.label ?? fieldKey;
}

function valueLabelFor(fields: FieldDefinition[], fieldKey: string, value: string): string {
  const field = fields.find((f) => f.fieldKey === fieldKey);
  if (field?.type === "select") {
    const option = getSelectOptions(field).find((o) => o.value === value);
    return option?.label ?? value;
  }
  return value;
}

export default function FilterBar({
  fields,
  activeFilters,
  onRemoveFilter,
  onAddFilter,
}: FilterBarProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [textValue, setTextValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!addOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setAddOpen(false);
        setSelectedField(null);
        setTextValue("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [addOpen]);

  // Only select and lookup fields are offered as filter targets
  const filterableFields = fields.filter(
    (f) => f.type === "select" || f.type === "lookup"
  );

  const activeEntries = Object.entries(activeFilters).filter(([, v]) => Boolean(v));

  const resetAddState = () => {
    setSelectedField(null);
    setTextValue("");
    setAddOpen(false);
  };

  const handleAddFromSelect = (field: string, value: string) => {
    onAddFilter(field, value);
    resetAddState();
  };

  const handleAddFromInput = (field: string) => {
    if (!textValue.trim()) return;
    onAddFilter(field, textValue.trim());
    resetAddState();
  };

  const selectedFieldDef = selectedField
    ? fields.find((f) => f.fieldKey === selectedField) ?? null
    : null;

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-2">
      <Filter size={15} className="shrink-0 text-slate-400" />

      {activeEntries.map(([fieldKey, value]) => (
        <span
          key={fieldKey}
          className="app-badge border border-slate-200 bg-slate-50 text-slate-700"
        >
          <span className="text-slate-500">{fieldLabelFor(fields, fieldKey)}:</span>
          <span>{valueLabelFor(fields, fieldKey, value)}</span>
          <button
            type="button"
            onClick={() => onRemoveFilter(fieldKey)}
            className="ml-0.5 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label={`Remove filter ${fieldLabelFor(fields, fieldKey)}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="app-button-ghost"
          aria-haspopup="listbox"
          aria-expanded={addOpen}
        >
          <Plus size={15} />
          Add Filter
        </button>

        {addOpen && (
          <div
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {!selectedField && (
              <>
                {filterableFields.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-400">No filterable fields</p>
                ) : (
                  filterableFields.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        setSelectedField(field.fieldKey);
                        setTextValue("");
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      <span className="truncate">{field.label}</span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {field.type}
                      </span>
                    </button>
                  ))
                )}
              </>
            )}

            {selectedFieldDef && (
              <div className="p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-slate-500">
                    {selectedFieldDef.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedField(null);
                      setTextValue("");
                    }}
                    className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Back to field list"
                  >
                    <X size={14} />
                  </button>
                </div>

                {selectedFieldDef.type === "select" ? (
                  <ul role="listbox" className="max-h-48 overflow-y-auto">
                    {getSelectOptions(selectedFieldDef).map((option, idx) => (
                      <li key={`${option.value}-${idx}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => handleAddFromSelect(selectedFieldDef.fieldKey, option.value)}
                          className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                        >
                          {option.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={textValue}
                      onChange={(e) => setTextValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddFromInput(selectedFieldDef.fieldKey);
                        }
                      }}
                      placeholder={
                        selectedFieldDef.type === "lookup"
                          ? "Enter record ID"
                          : "Enter value"
                      }
                      className="app-input h-9 text-sm"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleAddFromInput(selectedFieldDef.fieldKey)}
                      className="app-button-primary h-9 px-3"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
