import type { JSX } from "react";
import type { FieldDisplayProps } from "../registry";

/**
 * Renders a plain text field value. Empty/null/undefined values render the
 * shared neutral em dash so list/detail surfaces stay visually consistent.
 */
export default function TextDisplay({ value }: FieldDisplayProps): JSX.Element {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400">—</span>;
  }
  return <span className="text-slate-700">{String(value)}</span>;
}
