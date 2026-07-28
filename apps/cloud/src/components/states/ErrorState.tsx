"use client";

import { AlertCircle } from "lucide-react";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  retryAction?: {
    label: string;
    onClick: () => void;
  };
}

export function ErrorState({
  title = "Something went wrong",
  description,
  retryAction,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center px-6 py-12 text-center"
    >
      <AlertCircle size={28} className="text-red-400" />
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      ) : null}
      {retryAction ? (
        <button
          type="button"
          onClick={retryAction.onClick}
          className="app-button-secondary mt-4"
        >
          {retryAction.label}
        </button>
      ) : null}
    </div>
  );
}

export default ErrorState;
