"use client";

import { useState } from "react";
import type { FieldDefinition } from "@runory/platform-core";
import SchemaField from "./SchemaField";
import { useI18n } from "@/i18n/locale-provider";

type RecordData = Record<string, string | number | boolean | null>;
type ViewConfig = {
  columns?: Array<{ field: string; label?: string }>;
  sections?: Array<{ title: string; fields: Array<{ field: string; required?: boolean }> }>;
};

interface SchemaFormProps {
  fields: FieldDefinition[];
  viewConfig: ViewConfig;
  initialValues?: RecordData;
  onSubmit: (data: RecordData) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  workspaceId?: string;
}

interface FormSection {
  title: string;
  fields: { field: string; required?: boolean }[];
}

export default function SchemaForm({
  fields,
  viewConfig,
  initialValues = {},
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel,
  workspaceId,
}: SchemaFormProps) {
  const { t } = useI18n();
  const fieldMap = new Map(fields.map((f) => [f.fieldKey, f]));
  const sections: FormSection[] = viewConfig?.sections ?? [];

  const [values, setValues] = useState<RecordData>(() => {
    const init: RecordData = {};
    for (const f of fields) {
      init[f.fieldKey] =
        initialValues[f.fieldKey] ??
        (f.type === "boolean" ? false : f.defaultValue ?? "");
    }
    return init;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (fieldKey: string, value: string | number | boolean | null) => {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
    setErrors((prev) => {
      if (!prev[fieldKey]) return prev;
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    for (const section of sections) {
      for (const sf of section.fields) {
        const fieldDef = fieldMap.get(sf.field);
        const required = sf.required ?? fieldDef?.required ?? false;
        if (required) {
          const v = values[sf.field];
          if (v === "" || v === null || v === undefined) {
            newErrors[sf.field] = t("workspace.form.required", { field: fieldDef?.label ?? sf.field });
          }
        }
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(values);
  };

  if (sections.length === 0) {
    return <p className="text-sm text-slate-500">{t("workspace.form.noFields")}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {sections.map((section, si) => (
        <div
          key={si}
          className="app-card p-5 sm:p-6"
        >
          <h3 className="mb-4 text-sm font-bold text-slate-900">
            {section.title}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {section.fields.map((sf) => {
              const fieldDef = fieldMap.get(sf.field);
              if (!fieldDef) return null;
              const required = sf.required ?? fieldDef.required ?? false;
              const isExtension =
                fieldDef.ownership === "workspace_extension";
              return (
                <div
                  key={sf.field}
                  className={
                    fieldDef.type === "boolean" ? "sm:col-span-1" : "sm:col-span-1"
                  }
                >
                  <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
                    {fieldDef.label}
                    {required && <span className="text-red-500">*</span>}
                    {isExtension && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                        {t("workspace.extension")}
                      </span>
                    )}
                  </label>
                  <SchemaField
                    field={fieldDef}
                    value={values[sf.field]}
                    onChange={(v) => handleChange(sf.field, v)}
                    workspaceId={workspaceId}
                  />
                  {errors[sf.field] && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors[sf.field]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="app-button-secondary"
          >
            {cancelLabel ?? t("workspace.cancel")}
          </button>
        )}
        <button
          type="submit"
          className="app-button-primary"
        >
          {submitLabel ?? t("workspace.save")}
        </button>
      </div>
    </form>
  );
}
