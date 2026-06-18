"use client";

import type { FieldDefinition } from "@/lib/metadata";

interface SchemaFieldProps {
  field: FieldDefinition;
  value: any;
  onChange: (value: any) => void;
}

export default function SchemaField({ field, value, onChange }: SchemaFieldProps) {
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
