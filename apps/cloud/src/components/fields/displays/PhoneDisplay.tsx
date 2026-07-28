import type { JSX } from "react";
import type { FieldDisplayProps } from "../registry";

/**
 * Renders a phone value as a clickable `tel:` link. Empty values render the
 * shared neutral em dash.
 */
export default function PhoneDisplay({ value }: FieldDisplayProps): JSX.Element {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400">—</span>;
  }
  const phone = String(value);
  return (
    <a href={`tel:${phone}`} className="text-indigo-600 hover:text-indigo-700">
      {phone}
    </a>
  );
}
