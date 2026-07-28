import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Small uppercase label rendered above the title. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Right-aligned action buttons. */
  actions?: ReactNode;
}

/**
 * PageHeader — the top-of-page heading block.
 *
 * Encodes the pattern already used in ObjectListPage, the workflows page,
 * the automations page, etc.: flex-col on mobile, flex-row items-end
 * justify-between on sm+.
 */
export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow && <p className="app-eyebrow">{eyebrow}</p>}
        <h1 className="text-3xl font-bold tracking-[-.025em] text-slate-950">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 self-start">{actions}</div>}
    </header>
  );
}
