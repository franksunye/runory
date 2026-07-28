import type { JSX } from "react";
import { fieldTypes, type FieldType } from "@runory/contracts";

import {
  FIELD_DISPLAY_RENDERERS,
  type FieldDisplayProps,
  type FieldDisplayRenderer,
} from "./registry";

export type { FieldDisplayProps, FieldDisplayRenderer } from "./registry";

const KNOWN_FIELD_TYPES: Set<string> = new Set(fieldTypes);

/** Narrows a persisted `field.type` string to the closed contract union. */
function isFieldType(value: string): value is FieldType {
  return KNOWN_FIELD_TYPES.has(value);
}

/** Tracks legacy/invalid types already warned about so each logs once. */
const warnedTypes = new Set<string>();

/**
 * Dispatches a field value to the renderer registered for its type.
 *
 * Renderers are pure presentation: they format an already-authorized value and
 * never own fetching, authorization, or navigation. If `field.type` is not in
 * the registry (a persisted legacy or invalid type), this renders a neutral
 * text fallback and emits a bounded `console.warn` once per type. Newly
 * published manifests with unadmitted types still fail contract validation.
 */
export default function FieldDisplay({
  value,
  displayValue,
  field,
  locale,
}: FieldDisplayProps): JSX.Element {
  const fieldType = field.type;

  if (!isFieldType(fieldType)) {
    if (!warnedTypes.has(fieldType)) {
      warnedTypes.add(fieldType);
      console.warn(
        `[FieldDisplay] No renderer registered for field type "${fieldType}" ` +
          `(field key: ${field.fieldKey ?? "unknown"}). Rendering neutral text fallback.`,
      );
    }
    const fallback =
      displayValue ??
      (value === null || value === undefined || value === ""
        ? undefined
        : String(value));
    if (fallback === undefined || fallback === "") {
      return <span className="text-slate-400">—</span>;
    }
    return <span className="text-slate-700">{fallback}</span>;
  }

  const Renderer: FieldDisplayRenderer = FIELD_DISPLAY_RENDERERS[fieldType];
  return (
    <Renderer
      value={value}
      displayValue={displayValue}
      field={field}
      locale={locale}
    />
  );
}
