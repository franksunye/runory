"use client";

// ── Mobile Forms 2.0 Renderer (v0.5.1) ──
//
// Per v0.5.1 Mobile Field-Work Spec §4.2 & §5.5:
// Renders Forms 2.0 blocks (header, field, checklist, evidence, signature) in a
// mobile-first, card-based layout with large touch targets and inline
// validation.  File inputs support direct camera capture where the browser
// permits it.  Signatures record signer label, capturer, and timestamp.

import { useCallback, useMemo, useRef, useState } from "react";
import type { FormBlock } from "@runory/contracts";
import {
  AlertCircle,
  Camera,
  Check,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";

// ── Internal answer value types ──

interface ChecklistItemAnswer {
  result: "pass" | "fail" | "na" | null;
  notes: string;
}
type ChecklistBlockAnswer = Record<string, ChecklistItemAnswer>;

interface SignatureAnswer {
  signerLabel: string;
  acknowledged: boolean;
  timestamp: string;
}

interface EvidenceEntry {
  id: string;
  file: File;
  previewUrl: string;
}

// ── Props ──

export interface MobileFormRendererProps {
  schema: { blocks: FormBlock[] };
  initialAnswers?: Record<string, unknown>;
  onSubmit: (answers: Record<string, unknown>) => void;
  submitting?: boolean;
  workspaceId?: string;
}

// ── Helpers ──

function fieldAnswerKey(block: FormBlock): string {
  return block.field_key ?? block.id;
}

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Pass/Fail/N/A button styles
const PFN_STYLES: Record<string, { active: string; idle: string }> = {
  pass: {
    active: "bg-green-600 text-white border-green-600",
    idle: "text-green-700 border-green-300 bg-white",
  },
  fail: {
    active: "bg-red-600 text-white border-red-600",
    idle: "text-red-700 border-red-300 bg-white",
  },
  na: {
    active: "bg-slate-500 text-white border-slate-500",
    idle: "text-slate-600 border-slate-300 bg-white",
  },
};

// ── Component ──

export function MobileFormRenderer({
  schema,
  initialAnswers,
  onSubmit,
  submitting = false,
}: MobileFormRendererProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    initialAnswers ?? {}
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  // Hidden file input refs (one per evidence block for camera + gallery)
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const galleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Generic answer setter ──
  const setAnswer = useCallback(
    (key: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  // ── Validation ──
  const validate = useCallback((): Record<string, string> => {
    const nextErrors: Record<string, string> = {};

    for (const block of schema.blocks) {
      switch (block.block_type) {
        case "field": {
          if (block.required) {
            const key = fieldAnswerKey(block);
            const value = answers[key];
            if (
              value === undefined ||
              value === null ||
              value === "" ||
              (block.field_type === "boolean" && value !== true)
            ) {
              nextErrors[key] = "This field is required";
            }
          }
          break;
        }

        case "checklist": {
          const blockAnswers = (answers[block.id] as ChecklistBlockAnswer) ?? {};
          for (const item of block.items ?? []) {
            if (item.required) {
              const itemAns = blockAnswers[item.id];
              if (!itemAns || itemAns.result !== "pass") {
                nextErrors[block.id] =
                  "All required checklist items must pass";
                break;
              }
            }
          }
          break;
        }

        case "evidence": {
          const required = block.required_count ?? 0;
          if (required > 0) {
            const files = (answers[block.id] as EvidenceEntry[]) ?? [];
            if (files.length < required) {
              nextErrors[block.id] = `At least ${required} photo(s) required`;
            }
          }
          break;
        }

        case "signature": {
          const sig = answers[block.id] as SignatureAnswer | undefined;
          if (!sig || !sig.acknowledged || !sig.signerLabel.trim()) {
            nextErrors[block.id] =
              "Acknowledgment and signer name are required";
          }
          break;
        }

        case "header":
        default:
          break;
      }
    }

    return nextErrors;
  }, [schema.blocks, answers]);

  // ── Submit handler ──
  const handleSubmit = useCallback(() => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      // Scroll to first error
      const firstErrorKey = Object.keys(validationErrors)[0];
      const el = document.querySelector(`[data-error-key="${firstErrorKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    onSubmit(answers);
  }, [validate, answers, onSubmit]);

  // ── Field answer getter ──
  const getFieldAnswer = useCallback(
    (block: FormBlock): unknown => {
      return answers[fieldAnswerKey(block)];
    },
    [answers]
  );

  // ── Checklist helpers ──
  const getChecklistAnswer = useCallback(
    (block: FormBlock): ChecklistBlockAnswer => {
      return (answers[block.id] as ChecklistBlockAnswer) ?? {};
    },
    [answers]
  );

  const setChecklistItem = useCallback(
    (
      block: FormBlock,
      itemId: string,
      updates: Partial<ChecklistItemAnswer>
    ) => {
      const current = (answers[block.id] as ChecklistBlockAnswer) ?? {};
      const existing = current[itemId] ?? {
        result: null,
        notes: "",
      };
      const updated = {
        ...existing,
        ...updates,
      };
      setAnswer(block.id, {
        ...current,
        [itemId]: updated,
      });
    },
    [answers, setAnswer]
  );

  // ── Evidence helpers ──
  const getEvidenceFiles = useCallback(
    (block: FormBlock): EvidenceEntry[] => {
      return (answers[block.id] as EvidenceEntry[]) ?? [];
    },
    [answers]
  );

  const handleFilesSelected = useCallback(
    (block: FormBlock, fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const accept = block.accepted_types ?? ["image/*"];

      const newEntries: EvidenceEntry[] = [];
      for (const file of Array.from(fileList)) {
        // Basic type filtering: accept if the block allows image/* or the
        // file's MIME type is explicitly in the accepted_types list.
        if (
          !accept.includes("image/*") &&
          !accept.some((t) => file.type === t)
        ) {
          continue;
        }
        newEntries.push({
          id: genId("ev"),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }

      if (newEntries.length === 0) return;

      const current = (answers[block.id] as EvidenceEntry[]) ?? [];
      setAnswer(block.id, [...current, ...newEntries]);

      // Simulate upload progress
      setUploading((prev) => ({ ...prev, [block.id]: true }));
      window.setTimeout(() => {
        setUploading((prev) => {
          const next = { ...prev };
          delete next[block.id];
          return next;
        });
      }, 1500);
    },
    [answers, setAnswer]
  );

  const removeEvidenceFile = useCallback(
    (block: FormBlock, entryId: string) => {
      const current = (answers[block.id] as EvidenceEntry[]) ?? [];
      const entry = current.find((e) => e.id === entryId);
      if (entry) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      setAnswer(
        block.id,
        current.filter((e) => e.id !== entryId)
      );
    },
    [answers, setAnswer]
  );

  // ── Signature helpers ──
  const getSignatureAnswer = useCallback(
    (block: FormBlock): SignatureAnswer => {
      return (
        (answers[block.id] as SignatureAnswer) ?? {
          signerLabel: "",
          acknowledged: false,
          timestamp: "",
        }
      );
    },
    [answers]
  );

  const setSignatureField = useCallback(
    (
      block: FormBlock,
      updates: Partial<SignatureAnswer>,
      recordTimestamp = false
    ) => {
      const current = getSignatureAnswer(block);
      const updated: SignatureAnswer = {
        ...current,
        ...updates,
      };
      if (recordTimestamp && updates.acknowledged) {
        updated.timestamp = new Date().toISOString();
      }
      if (!updated.acknowledged) {
        updated.timestamp = "";
      }
      setAnswer(block.id, updated);
    },
    [getSignatureAnswer, setAnswer]
  );

  // ── Block renderers ──

  const renderHeader = (block: FormBlock) => (
    <div className="px-1 py-2" data-error-key={block.id}>
      <h2 className="text-lg font-bold tracking-tight text-slate-950">
        {block.label}
      </h2>
    </div>
  );

  const renderField = (block: FormBlock) => {
    const key = fieldAnswerKey(block);
    const value = getFieldAnswer(block);
    const error = errors[key];
    const inputId = `field-${block.id}`;

    return (
      <div data-error-key={key}>
        <label
          htmlFor={inputId}
          className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-slate-700"
        >
          {block.label}
          {block.required && <span className="text-red-500">*</span>}
        </label>

        {block.field_type === "text" && (
          <input
            id={inputId}
            type="text"
            value={(value as string) ?? ""}
            onChange={(e) => setAnswer(key, e.target.value)}
            className="app-input min-h-[48px]"
            placeholder={block.label}
          />
        )}

        {block.field_type === "number" && (
          <input
            id={inputId}
            type="number"
            value={(value as string | number) ?? ""}
            onChange={(e) =>
              setAnswer(
                key,
                e.target.value === "" ? "" : Number(e.target.value)
              )
            }
            className="app-input min-h-[48px]"
            placeholder={block.label}
            inputMode="numeric"
          />
        )}

        {block.field_type === "date" && (
          <input
            id={inputId}
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => setAnswer(key, e.target.value)}
            className="app-input min-h-[48px]"
          />
        )}

        {block.field_type === "select" && (
          <select
            id={inputId}
            value={(value as string) ?? ""}
            onChange={(e) => setAnswer(key, e.target.value)}
            className="app-input min-h-[48px]"
          >
            <option value="">Select…</option>
            {(block.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}

        {block.field_type === "boolean" && (
          <button
            type="button"
            id={inputId}
            role="switch"
            aria-checked={value === true}
            onClick={() => setAnswer(key, !(value === true))}
            className={`flex min-h-[48px] w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              value === true
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-300 bg-white text-slate-500"
            }`}
          >
            <span>{value === true ? "Yes" : "No"}</span>
            <span
              className={`relative h-6 w-11 rounded-full transition ${
                value === true ? "bg-indigo-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                  value === true ? "left-[22px]" : "left-0.5"
                }`}
              />
            </span>
          </button>
        )}

        {error && (
          <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
            <AlertCircle size={12} />
            {error}
          </p>
        )}
      </div>
    );
  };

  const renderChecklist = (block: FormBlock) => {
    const blockAnswers = getChecklistAnswer(block);
    const error = errors[block.id];

    return (
      <div data-error-key={block.id}>
        <div className="mb-3 flex items-center gap-1 text-sm font-semibold text-slate-700">
          {block.label}
        </div>

        <div className="space-y-3">
          {(block.items ?? []).map((item) => {
            const itemAns = blockAnswers[item.id] ?? {
              result: null,
              notes: "",
            };
            const results = item.pass_fail_na
              ? (["pass", "fail", "na"] as const)
              : (["pass", "fail"] as const);

            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
              >
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm font-medium text-slate-800">
                    {item.label}
                    {item.required && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                  </p>
                </div>

                {/* Pass / Fail / N/A buttons */}
                <div className="mt-2.5 flex gap-2">
                  {results.map((res) => {
                    const isActive = itemAns.result === res;
                    const styles = PFN_STYLES[res];
                    const labels: Record<string, string> = {
                      pass: "Pass",
                      fail: "Fail",
                      na: "N/A",
                    };
                    return (
                      <button
                        key={res}
                        type="button"
                        onClick={() =>
                          setChecklistItem(block, item.id, { result: res })
                        }
                        className={`flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition active:scale-[0.97] ${
                          isActive ? styles.active : styles.idle
                        }`}
                      >
                        {res === "pass" && <Check size={14} />}
                        {res === "fail" && <X size={14} />}
                        {labels[res]}
                      </button>
                    );
                  })}
                </div>

                {/* Notes */}
                <textarea
                  value={itemAns.notes}
                  onChange={(e) =>
                    setChecklistItem(block, item.id, { notes: e.target.value })
                  }
                  placeholder="Notes (optional)…"
                  className="mt-2 min-h-[44px] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                  rows={2}
                />
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
            <AlertCircle size={12} />
            {error}
          </p>
        )}
      </div>
    );
  };

  const renderEvidence = (block: FormBlock) => {
    const files = getEvidenceFiles(block);
    const error = errors[block.id];
    const isUploading = uploading[block.id];
    const required = block.required_count ?? 0;

    return (
      <div data-error-key={block.id}>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="flex items-center gap-1 text-sm font-semibold text-slate-700">
            {block.label}
            {required > 0 && (
              <span className="ml-1 text-xs font-normal text-slate-400">
                ({files.length}/{required})
              </span>
            )}
          </label>
        </div>

        {/* Upload buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraInputRefs.current[block.id]?.click()}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 text-sm font-semibold text-indigo-700 active:bg-indigo-100"
          >
            <Camera size={16} />
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => galleryInputRefs.current[block.id]?.click()}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50"
          >
            <Upload size={16} />
            Gallery
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={(el) => {
            cameraInputRefs.current[block.id] = el;
          }}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(block, e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={(el) => {
            galleryInputRefs.current[block.id] = el;
          }}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(block, e.target.files);
            e.target.value = "";
          }}
        />

        {/* Upload progress */}
        {isUploading && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2">
            <Loader2 size={14} className="animate-spin text-indigo-600" />
            <span className="text-xs font-medium text-indigo-700">
              Uploading…
            </span>
            <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-indigo-200">
              <div className="h-full w-full animate-pulse rounded-full bg-indigo-600" />
            </div>
          </div>
        )}

        {/* File previews */}
        {files.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {files.map((entry) => (
              <div
                key={entry.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              >
                <img
                  src={entry.previewUrl}
                  alt={entry.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeEvidenceFile(block, entry.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
                  aria-label="Remove photo"
                >
                  <X size={14} />
                </button>
                <p className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1 py-0.5 text-[9px] text-white">
                  {formatFileSize(entry.file.size)}
                </p>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
            <AlertCircle size={12} />
            {error}
          </p>
        )}
      </div>
    );
  };

  const renderSignature = (block: FormBlock) => {
    const sig = getSignatureAnswer(block);
    const error = errors[block.id];

    return (
      <div data-error-key={block.id}>
        <div className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-700">
          {block.label}
        </div>

        {/* Acknowledgment text */}
        {block.acknowledgment_text && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm leading-relaxed text-slate-600">
              {block.acknowledgment_text}
            </p>
          </div>
        )}

        {/* Signer label */}
        <input
          type="text"
          value={sig.signerLabel}
          onChange={(e) =>
            setSignatureField(block, { signerLabel: e.target.value })
          }
          placeholder="Signer name (e.g. Customer Name)"
          className="app-input min-h-[48px]"
        />

        {/* Acknowledge checkbox */}
        <button
          type="button"
          onClick={() =>
            setSignatureField(block, { acknowledged: !sig.acknowledged }, true)
          }
          className={`mt-3 flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
            sig.acknowledged
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-slate-300 bg-white text-slate-600"
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
              sig.acknowledged
                ? "border-green-500 bg-green-500 text-white"
                : "border-slate-300 bg-white"
            }`}
          >
            {sig.acknowledged && <Check size={14} />}
          </span>
          I acknowledge
        </button>

        {/* Timestamp display */}
        {sig.timestamp && (
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
            <FileText size={11} />
            Signed at {new Date(sig.timestamp).toLocaleString()}
          </p>
        )}

        {error && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
            <AlertCircle size={12} />
            {error}
          </p>
        )}
      </div>
    );
  };

  // ── Render blocks ──
  const renderBlock = (block: FormBlock) => {
    // Headers render without a card wrapper
    if (block.block_type === "header") {
      return <div key={block.id}>{renderHeader(block)}</div>;
    }

    return (
      <div key={block.id} className="app-card p-4 shadow-sm">
        {block.block_type === "field" && renderField(block)}
        {block.block_type === "checklist" && renderChecklist(block)}
        {block.block_type === "evidence" && renderEvidence(block)}
        {block.block_type === "signature" && renderSignature(block)}
      </div>
    );
  };

  const hasErrors = Object.keys(errors).length > 0;

  // Memoized block list to keep re-renders shallow
  const renderedBlocks = useMemo(
    () => schema.blocks.map(renderBlock),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schema.blocks, answers, errors, uploading]
  );

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Form body */}
      <div className="flex-1 space-y-4 px-4 py-4">
        {renderedBlocks}
      </div>

      {/* Sticky submit bar */}
      <div
        className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
        }}
      >
        {hasErrors && (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
            <AlertCircle size={13} />
            Please fix the highlighted errors before submitting.
          </p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition active:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Check size={18} />
          )}
          {submitting ? "Submitting…" : "Submit Form"}
        </button>
      </div>
    </div>
  );
}

export default MobileFormRenderer;
