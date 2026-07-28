import type { JSX } from "react";
import type { FieldDisplayProps } from "../registry";
import { resolveDisplayLabel } from "../format";

/**
 * Renders the resolved display value of a lookup reference as plain text.
 * Empty values render the shared neutral em dash.
 *
 * This component intentionally does NOT render a link. The page or component
 * that owns navigation for the target object should wrap this renderer when an
 * authorized internal route is available.
 */
export default function LookupDisplay({ value, displayValue }: FieldDisplayProps): JSX.Element {
  const label = resolveDisplayLabel(value, displayValue);
  if (label === null) {
    return <span className="text-slate-400">—</span>;
  }
  return <span className="text-slate-700">{label}</span>;
}
