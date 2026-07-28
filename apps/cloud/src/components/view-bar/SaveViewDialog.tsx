"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";

export interface SaveViewDialogProps {
  open: boolean;
  defaultName: string;
  onSave: (name: string) => void;
  onClose: () => void;
  saving?: boolean;
  labels: {
    title: string;
    placeholder: string;
    save: string;
    cancel: string;
  };
}

export default function SaveViewDialog({
  open,
  defaultName,
  onSave,
  onClose,
  saving = false,
  labels,
}: SaveViewDialogProps) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      // Focus input after dialog opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, defaultName]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, saving, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{labels.title}</h3>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={labels.placeholder}
          className="app-input mb-4"
          maxLength={80}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="app-button-ghost"
          >
            {labels.cancel}
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="app-button-primary"
          >
            {saving ? "..." : labels.save}
          </button>
        </div>
      </form>
    </div>
  );
}
