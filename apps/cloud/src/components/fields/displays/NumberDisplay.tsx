import type { JSX } from "react";
import type { FieldDisplayProps } from "../registry";
import { formatNumberValue } from "../format";

/**
 * Renders a numeric value formatted for the active locale. Empty values render
 * the shared neutral em dash. Non-numeric payloads fall back to their raw
 * string form instead of surfacing `NaN`.
 */
export default function NumberDisplay({ value, locale }: FieldDisplayProps): JSX.Element {
  const formatted = formatNumberValue(value, locale);
  if (formatted === null) {
    return <span className="text-slate-400">—</span>;
  }
  return <span className="text-slate-700">{formatted}</span>;
}
