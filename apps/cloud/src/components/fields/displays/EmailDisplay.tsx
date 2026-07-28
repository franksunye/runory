import type { JSX } from "react";
import type { FieldDisplayProps } from "../registry";

/**
 * Renders an email value as a clickable `mailto:` link. Empty values render
 * the shared neutral em dash.
 */
export default function EmailDisplay({ value }: FieldDisplayProps): JSX.Element {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400">—</span>;
  }
  const email = String(value);
  return (
    <a
      href={`mailto:${email}`}
      className="text-indigo-600 hover:text-indigo-700"
    >
      {email}
    </a>
  );
}
