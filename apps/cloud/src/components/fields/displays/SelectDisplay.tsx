import type { JSX } from "react";
import type { FieldDisplayProps } from "../registry";
import { humanizeSelectValue, resolveDisplayLabel } from "../format";

/**
 * Renders a select field value as a neutral badge using the resolved option
 * label (from `displayValue`) or the raw value. Empty values render the shared
 * neutral em dash.
 *
 * The badge is always neutral. Semantic option tones require a later typed
 * metadata addition; they must not be guessed globally from values such as
 * `open`, `paid`, or `failed`.
 */
export default function SelectDisplay({ value, displayValue }: FieldDisplayProps): JSX.Element {
  const label = resolveDisplayLabel(value, displayValue);
  if (label === null) {
    return <span className="text-slate-400">—</span>;
  }
  const businessLabel = displayValue ? label : humanizeSelectValue(label);
  return <span className="app-badge bg-slate-100 text-slate-700">{businessLabel}</span>;
}
