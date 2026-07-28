import type { JSX } from "react";
import type { FieldDisplayProps } from "../registry";
import { initials, resolveDisplayLabel } from "../format";

/**
 * Renders a user reference as a small initials avatar plus the resolved
 * display name. Empty values render the shared neutral em dash.
 *
 * The avatar is a lightweight CSS circle (no avatar image / presence) so the
 * component stays a pure, RSC-compatible primitive.
 */
export default function UserDisplay({ value, displayValue }: FieldDisplayProps): JSX.Element {
  const name = resolveDisplayLabel(value, displayValue);
  if (name === null) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-medium grid place-items-center">
        {initials(name)}
      </span>
      <span className="text-slate-700">{name}</span>
    </span>
  );
}
