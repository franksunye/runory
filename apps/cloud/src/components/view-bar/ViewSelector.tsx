"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Pencil, Trash2 } from "lucide-react";
import { useViews } from "@/lib/api-hooks";
import { apiFetch } from "@/lib/api-fetch";
import ConfirmDialog from "./ConfirmDialog";

export interface ViewSelectorProps {
  workspaceId: string;
  objectKey: string;
  currentViewKey: string;
  basePath: string;
  labels: {
    rename: string;
    delete: string;
    deleteConfirm: string;
    deleteTitle: string;
    cancel: string;
  };
}

export default function ViewSelector({
  workspaceId,
  objectKey,
  currentViewKey,
  basePath,
  labels,
}: ViewSelectorProps) {
  const router = useRouter();
  const { data: views = [], mutate: mutateViews } = useViews(workspaceId, objectKey);
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; viewKey: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const listViews = views.filter((v) => v.viewType === "list");
  const currentView = listViews.find((v) => v.viewKey === currentViewKey);
  const defaultViewKey = listViews[0]?.viewKey;

  const isCustom = (view: typeof listViews[number]) => !view.moduleId && !view.extensionId;

  const handleSelect = (viewKey: string) => {
    if (renamingId) return;
    setOpen(false);
    if (viewKey === defaultViewKey) {
      router.push(basePath);
    } else {
      router.push(`${basePath}?view=${viewKey}`);
    }
  };

  const handleRenameStart = (viewId: string, currentLabel: string) => {
    setRenamingId(viewId);
    setRenameValue(currentLabel);
  };

  const handleRenameSubmit = async (viewId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/views/${viewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      void mutateViews();
    } catch {
      // Error silently swallowed; user can retry
    }
    setRenamingId(null);
  };

  // Open the confirmation dialog instead of using blocking window.confirm()
  const handleDeleteClick = (viewId: string, viewKey: string) => {
    setOpen(false);
    setDeleteTarget({ id: viewId, viewKey });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/views/${deleteTarget.id}`, {
        method: "DELETE",
      });
      void mutateViews();
      if (deleteTarget.viewKey === currentViewKey) {
        router.push(basePath);
      }
    } catch {
      // Error silently swallowed
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (listViews.length === 0) return null;

  return (
    <>
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
            className="absolute left-0 top-full z-50 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {listViews.map((view) => {
              const isActive = view.viewKey === currentViewKey;
              const custom = isCustom(view);
              const isRenaming = renamingId === view.id;

              if (isRenaming) {
                return (
                  <div key={view.id} className="flex items-center gap-1 px-2 py-1">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleRenameSubmit(view.id);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setRenamingId(null);
                        }
                      }}
                      onBlur={() => void handleRenameSubmit(view.id)}
                      className="app-input h-8 flex-1 text-sm"
                      autoFocus
                      maxLength={80}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={view.id}
                  className={`group flex items-center justify-between gap-1 px-1 pr-2 transition hover:bg-slate-50 ${
                    isActive ? "bg-indigo-50/50" : ""
                  }`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSelect(view.viewKey)}
                    className={`flex flex-1 items-center gap-2 py-2 pl-2 text-left text-sm ${
                      isActive ? "font-semibold text-indigo-700" : "text-slate-700"
                    }`}
                  >
                    <span className="truncate">{view.label}</span>
                    {isActive && <Check size={15} className="shrink-0 text-indigo-600" />}
                  </button>
                  {custom && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameStart(view.id, view.label);
                        }}
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                        title={labels.rename}
                        aria-label={labels.rename}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(view.id, view.viewKey);
                        }}
                        className="rounded p-1 text-slate-400 transition hover:bg-red-100 hover:text-red-600"
                        title={labels.delete}
                        aria-label={labels.delete}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={labels.deleteTitle}
        message={labels.deleteConfirm}
        confirmLabel={labels.delete}
        cancelLabel={labels.cancel}
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => !deleting && setDeleteTarget(null)}
        loading={deleting}
        variant="danger"
      />
    </>
  );
}
