"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";
import { apiFetch, apiPost } from "@/lib/api-fetch";

// ── Types ──

interface FormBlockEditor {
  id: string;
  block_type: "header" | "field" | "checklist" | "evidence" | "signature";
  label: string;
  // field-specific
  field_key?: string;
  field_type?: "text" | "number" | "date" | "select" | "boolean";
  required?: boolean;
  options?: string[];
  // checklist-specific
  items?: Array<{
    id: string;
    label: string;
    required: boolean;
    pass_fail_na: boolean;
  }>;
  required_count?: number;
  // evidence-specific
  accepted_types?: string[];
  // signature-specific
  acknowledgment_text?: string;
}

interface Toast {
  type: "success" | "error";
  message: string;
}

const BLOCK_TYPES: Array<{ value: FormBlockEditor["block_type"]; label: string; icon: string }> = [
  { value: "header", label: "Header", icon: "H" },
  { value: "field", label: "Field", icon: "F" },
  { value: "checklist", label: "Checklist", icon: "C" },
  { value: "evidence", label: "Evidence", icon: "E" },
  { value: "signature", label: "Signature", icon: "S" },
];

const FIELD_TYPES: Array<{ value: NonNullable<FormBlockEditor["field_type"]>; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "boolean", label: "Boolean" },
];

function genBlockId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Page (Suspense wrapper) ──

export default function FormEditorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading...</p>}>
      <FormEditor />
    </Suspense>
  );
}

// ── Editor ──

function FormEditor() {
  const workspaceId = useParams().workspaceId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingKey = searchParams.get("edit");
  const { t } = useI18n();

  const [loading, setLoading] = useState(!!editingKey);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Form state
  const [formKey, setFormKey] = useState("");
  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<FormBlockEditor[]>([]);
  const [existingDefId, setExistingDefId] = useState<string | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Load existing form definition for editing
  useEffect(() => {
    if (!editingKey) return;
    void (async () => {
      try {
        const json = await apiFetch<{
          success: boolean;
          error?: { message: string };
          data: Array<Record<string, unknown>>;
        }>(
          `/api/workspaces/${workspaceId}/forms/definitions`,
          { cache: "no-store" }
        );
        if (!json.success) throw new Error(json.error?.message ?? "Load failed");
        const def = (json.data as Array<Record<string, unknown>>).find(
          (d) => d.form_key === editingKey
        );
        if (!def) {
          showToast("error", "Form definition not found");
          return;
        }
        setExistingDefId(def.id as string);
        setFormKey(def.form_key as string);
        setName(def.name as string);

        // Load full definition to get schema (API uses formKey as path param)
        const detailJson = await apiFetch<{
          success: boolean;
          data?: { schema?: { blocks?: FormBlockEditor[] } };
        }>(
          `/api/workspaces/${workspaceId}/forms/definitions/${def.form_key}`,
          { cache: "no-store" }
        );
        if (detailJson.success && detailJson.data?.schema) {
          const rawBlocks = detailJson.data.schema.blocks ?? [];
          setBlocks(rawBlocks as FormBlockEditor[]);
        }
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [editingKey, workspaceId, showToast]);

  // ── Block operations ──

  const addBlock = (type: FormBlockEditor["block_type"]) => {
    const newBlock: FormBlockEditor = {
      id: genBlockId(type.slice(0, 3)),
      block_type: type,
      label: "",
    };
    if (type === "field") {
      newBlock.field_key = "";
      newBlock.field_type = "text";
      newBlock.required = false;
    }
    if (type === "checklist") {
      newBlock.items = [];
      newBlock.required_count = 0;
    }
    if (type === "evidence") {
      newBlock.accepted_types = ["image/jpeg", "image/png"];
      newBlock.required_count = 1;
    }
    if (type === "signature") {
      newBlock.acknowledgment_text = "I acknowledge the above information is correct.";
    }
    setBlocks([...blocks, newBlock]);
  };

  const updateBlock = (index: number, updates: Partial<FormBlockEditor>) => {
    setBlocks(blocks.map((b, i) => (i === index ? { ...b, ...updates } : b)));
  };

  const removeBlock = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const moveBlock = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === blocks.length - 1) return;
    const newBlocks = [...blocks];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    [newBlocks[index], newBlocks[swapIdx]] = [newBlocks[swapIdx], newBlocks[index]];
    setBlocks(newBlocks);
  };

  // ── Checklist item operations ──

  const addChecklistItem = (blockIndex: number) => {
    const block = blocks[blockIndex];
    if (!block.items) return;
    updateBlock(blockIndex, {
      items: [
        ...block.items,
        {
          id: genBlockId("cl"),
          label: "",
          required: false,
          pass_fail_na: true,
        },
      ],
    });
  };

  const updateChecklistItem = (
    blockIndex: number,
    itemIndex: number,
    updates: Partial<NonNullable<FormBlockEditor["items"]>[0]>
  ) => {
    const block = blocks[blockIndex];
    if (!block.items) return;
    const newItems = block.items.map((item, i) =>
      i === itemIndex ? { ...item, ...updates } : item
    );
    updateBlock(blockIndex, { items: newItems });
  };

  const removeChecklistItem = (blockIndex: number, itemIndex: number) => {
    const block = blocks[blockIndex];
    if (!block.items) return;
    updateBlock(blockIndex, {
      items: block.items.filter((_, i) => i !== itemIndex),
    });
  };

  // ── Save ──

  const handleSave = async () => {
    if (!formKey || !name) {
      showToast("error", "Form key and name are required");
      return;
    }
    if (blocks.length === 0) {
      showToast("error", "At least one block is required");
      return;
    }
    try {
      setSubmitting(true);
      const schema = { blocks };

      if (existingDefId) {
        // Update existing — publish a new version
        const json = await apiPost<{ success: boolean; error?: { message: string } }>(
          `/api/workspaces/${workspaceId}/forms/definitions`,
          { formKey, name, schema }
        );
        if (!json.success) throw new Error(json.error?.message ?? "Update failed");
        showToast("success", "Form definition updated");
      } else {
        // Create new
        const json = await apiPost<{ success: boolean; error?: { message: string } }>(
          `/api/workspaces/${workspaceId}/forms/definitions`,
          { formKey, name, schema }
        );
        if (!json.success) throw new Error(json.error?.message ?? "Create failed");
        showToast("success", "Form definition created");
      }
      router.push(`/w/${workspaceId}/forms`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 top-20 z-[60] flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertTriangle size={16} />
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push(`/w/${workspaceId}/forms`)}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="app-eyebrow">Forms 2.0</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            {editingKey ? "Edit Form Definition" : "Create Form Definition"}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={submitting}
          className="app-button-primary"
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CheckCircle2 size={16} />
          )}
          {t("workspace.save")}
        </button>
      </header>

      {/* Basic Info */}
      <section className="app-card space-y-4 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Form Key
            </label>
            <input
              type="text"
              value={formKey}
              onChange={(e) => setFormKey(e.target.value)}
              placeholder="e.g. service_checklist"
              disabled={!!editingKey}
              className="app-input h-9 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Unique identifier, cannot be changed after creation
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Form Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Service Checklist"
              className="app-input h-9"
            />
          </div>
        </div>
      </section>

      {/* Block Builder */}
      <section className="app-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">
            Form Blocks ({blocks.length})
          </h2>
          <div className="flex items-center gap-1">
            {BLOCK_TYPES.map((bt) => (
              <button
                key={bt.value}
                type="button"
                onClick={() => addBlock(bt.value)}
                className="flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-600"
                title={`Add ${bt.label} block`}
              >
                <Plus size={12} />
                {bt.label}
              </button>
            ))}
          </div>
        </div>

        {blocks.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
            <FileText size={32} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              No blocks yet. Use the buttons above to add form blocks.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {blocks.map((block, index) => (
              <div
                key={block.id}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
              >
                {/* Block header */}
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-indigo-100 text-[11px] font-bold text-indigo-600">
                    {block.block_type.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    {block.block_type}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveBlock(index, "up")}
                      disabled={index === 0}
                      className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 disabled:opacity-30"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(index, "down")}
                      disabled={index === blocks.length - 1}
                      className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 disabled:opacity-30"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(index)}
                      className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>

                {/* Block-specific fields */}
                <div className="space-y-3">
                  {/* Common: Label */}
                  <div>
                    <label className="mb-0.5 block text-[11px] font-semibold text-slate-500">
                      Label
                    </label>
                    <input
                      type="text"
                      value={block.label}
                      onChange={(e) => updateBlock(index, { label: e.target.value })}
                      placeholder="Block label / heading text"
                      className="app-input h-8 text-sm"
                    />
                  </div>

                  {/* Field type */}
                  {block.block_type === "field" && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-slate-500">
                            Field Key
                          </label>
                          <input
                            type="text"
                            value={block.field_key ?? ""}
                            onChange={(e) => updateBlock(index, { field_key: e.target.value })}
                            placeholder="e.g. work_performed"
                            className="app-input h-8 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-slate-500">
                            Field Type
                          </label>
                          <select
                            value={block.field_type ?? "text"}
                            onChange={(e) =>
                              updateBlock(index, {
                                field_type: e.target.value as FormBlockEditor["field_type"],
                              })
                            }
                            className="app-input h-8 text-sm"
                          >
                            {FIELD_TYPES.map((ft) => (
                              <option key={ft.value} value={ft.value}>
                                {ft.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {block.field_type === "select" && (
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-slate-500">
                            Options (one per line)
                          </label>
                          <textarea
                            value={(block.options ?? []).join("\n")}
                            onChange={(e) =>
                              updateBlock(index, {
                                options: e.target.value.split("\n").filter(Boolean),
                              })
                            }
                            placeholder="option1&#10;option2"
                            className="app-input h-20 resize-none text-sm"
                          />
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={block.required ?? false}
                          onChange={(e) => updateBlock(index, { required: e.target.checked })}
                          className="h-3.5 w-3.5"
                        />
                        Required
                      </label>
                    </>
                  )}

                  {/* Checklist items */}
                  {block.block_type === "checklist" && (
                    <div className="space-y-2">
                      {block.items?.map((item, itemIdx) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2"
                        >
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) =>
                              updateChecklistItem(index, itemIdx, { label: e.target.value })
                            }
                            placeholder="Checklist item label"
                            className="flex-1 border-0 bg-transparent text-sm outline-none"
                          />
                          <label className="flex items-center gap-1 text-[10px] text-slate-500">
                            <input
                              type="checkbox"
                              checked={item.pass_fail_na}
                              onChange={(e) =>
                                updateChecklistItem(index, itemIdx, { pass_fail_na: e.target.checked })
                              }
                              className="h-3 w-3"
                            />
                            P/F/N/A
                          </label>
                          <label className="flex items-center gap-1 text-[10px] text-slate-500">
                            <input
                              type="checkbox"
                              checked={item.required}
                              onChange={(e) =>
                                updateChecklistItem(index, itemIdx, { required: e.target.checked })
                              }
                              className="h-3 w-3"
                            />
                            Req
                          </label>
                          <button
                            type="button"
                            onClick={() => removeChecklistItem(index, itemIdx)}
                            className="text-slate-300 hover:text-red-500"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addChecklistItem(index)}
                        className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        <Plus size={12} />
                        Add Item
                      </button>
                    </div>
                  )}

                  {/* Evidence */}
                  {block.block_type === "evidence" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-[11px] font-semibold text-slate-500">
                          Accepted Types (comma separated)
                        </label>
                        <input
                          type="text"
                          value={(block.accepted_types ?? []).join(", ")}
                          onChange={(e) =>
                            updateBlock(index, {
                              accepted_types: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          placeholder="image/jpeg, image/png"
                          className="app-input h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[11px] font-semibold text-slate-500">
                          Required Count
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={block.required_count ?? 1}
                          onChange={(e) =>
                            updateBlock(index, { required_count: parseInt(e.target.value) || 1 })
                          }
                          className="app-input h-8 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Signature */}
                  {block.block_type === "signature" && (
                    <div>
                      <label className="mb-0.5 block text-[11px] font-semibold text-slate-500">
                        Acknowledgment Text
                      </label>
                      <textarea
                        value={block.acknowledgment_text ?? ""}
                        onChange={(e) =>
                          updateBlock(index, { acknowledgment_text: e.target.value })
                        }
                        className="app-input h-16 resize-none text-sm"
                        placeholder="I acknowledge that the information above is correct."
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* JSON Preview (collapsible) */}
      <details className="app-card p-5">
        <summary className="cursor-pointer text-xs font-semibold text-slate-500">
          JSON Schema Preview
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-300">
          {JSON.stringify({ formKey, name, schema: { blocks } }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
