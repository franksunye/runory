"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface PageSizeSelectorProps {
  value: number;
  onChange: (size: number) => void;
}

const PAGE_SIZES = [10, 20, 50, 100] as const;

export default function PageSizeSelector({ value, onChange }: PageSizeSelectorProps) {
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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="app-button-ghost"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value}/page</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 min-w-[120px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {PAGE_SIZES.map((size) => {
            const isActive = size === value;
            return (
              <button
                key={size}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(size);
                  setOpen(false);
                }}
                className={`flex w-full items-center px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                  isActive ? "font-semibold text-indigo-700" : "text-slate-700"
                }`}
              >
                {size}/page
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
