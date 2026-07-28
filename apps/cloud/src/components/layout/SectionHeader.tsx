import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  /** Optional icon rendered at 16px in text-indigo-600. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optional right-aligned actions. */
  actions?: ReactNode;
}

/**
 * SectionHeader — a compact in-card section heading.
 *
 * Layout: flex items-center justify-between mb-4.
 * Left side stacks the icon + title, with an optional description below.
 */
export function SectionHeader({ icon: Icon, title, description, actions }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className="text-indigo-600" />}
          <h2 className="font-bold text-slate-900">{title}</h2>
        </div>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
