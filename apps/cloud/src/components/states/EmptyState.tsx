"use client";

import { Inbox, type LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    tone?: "primary" | "secondary";
  };
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Icon size={28} className="text-slate-300" />
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className={
            action.tone === "primary"
              ? "app-button-primary mt-4"
              : "app-button-secondary mt-4"
          }
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export default EmptyState;
