import type { JSX } from "react";
import type { FieldDisplayProps } from "../registry";
import { formatBooleanLabel } from "../format";

/**
 * Renders a boolean value as localized yes/no text. `null`/`undefined` render
 * the shared neutral em dash. Localization is intentionally inline (no i18n
 * hook) so the component stays a pure, RSC-compatible primitive.
 */
export default function BooleanDisplay({ value, locale }: FieldDisplayProps): JSX.Element {
  const label = formatBooleanLabel(value, locale);
  if (label === null) {
    return <span className="text-slate-400">—</span>;
  }
  return <span className="text-slate-700">{label}</span>;
}
