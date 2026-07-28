import type { JSX } from "react";
import type { FieldDisplayProps } from "../registry";
import { formatDateValue } from "../format";

/**
 * Renders a date value for the active locale using a short month, numeric day,
 * and numeric year. Empty values render the shared neutral em dash. Invalid
 * dates fall back to the raw string so data is never silently lost.
 */
export default function DateDisplay({ value, locale }: FieldDisplayProps): JSX.Element {
  const formatted = formatDateValue(value, locale);
  if (formatted === null) {
    return <span className="text-slate-400">—</span>;
  }
  return <span className="text-slate-700">{formatted}</span>;
}
