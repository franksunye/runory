"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import { useViews } from "@/lib/api-hooks";

export interface ViewSelectorProps {
  workspaceId: string;
  objectKey: string;
  currentViewKey: string;
  basePath: string;
}

export default function ViewSelector({
  workspaceId,
  objectKey,
  currentViewKey,
  basePath,
}: ViewSelectorProps) {
  const router = useRouter();
  const { data: views = [] } = useViews(workspaceId, objectKey);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const listViews = views.filter((v) => v.viewType === "list");
  const currentView = listViews.find((v) => v.viewKey === currentViewKey);
  // The first list view is treated as the default — selecting it clears the
  // ?view= query param so the base URL shows the default view.
  const defaultViewKey = listViews[0]?.viewKey;

  const handleSelect = (viewKey: string) => {
    setOpen(false);
    if (viewKey === defaultViewKey) {
      router.push(basePath);
    } else {
      router.push(`${basePath}?view=${viewKey}`);
    }
  };

  if (listViews.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="app-button-ghost"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="max-w-[160px] truncate">
          {currentView?.label ?? currentViewKey}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {listViews.map((view) => {
            const isActive = view.viewKey === currentViewKey;
            return (
              <button
                key={view.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(view.viewKey)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                  isActive ? "font-semibold text-indigo-700" : "text-slate-700"
                }`}
              >
                <span className="truncate">{view.label}</span>
                {isActive && <Check size={15} className="shrink-0 text-indigo-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
