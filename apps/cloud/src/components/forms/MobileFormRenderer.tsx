"use client";

// ── Mobile Forms 2.0 Renderer (v0.5.1) ──
//
// Per v0.5.1 Mobile Field-Work Spec §4.2 & §5.5:
// Renders Forms 2.0 blocks (header, field, checklist, evidence, signature) in a
// mobile-first, card-based layout with large touch targets and inline
// validation.  File inputs support direct camera capture where the browser
// permits it.  Signatures record signer label, capturer, and timestamp.
//
// Evidence blocks upload files to the real attachment API
// (`POST /api/workspaces/{workspaceId}/uploads`) and store the returned
// attachment id in the form state — evidence is never kept as an untyped URL
// inside a form answer (Spec §5.5).  Uploads report real progress via
// XMLHttpRequest upload events and support explicit, idempotent retry.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormBlock } from "@runory/contracts";
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  FileText,
  Film,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useI18n } from "@/i18n/locale-provider";

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

type EvidenceStatus = "uploading" | "uploaded" | "error";

interface EvidenceEntry {
  /** Stable React key + XHR ref key (independent of the attachment id). */
  localId: string;
  /**
   * The attachment id once the upload succeeds; a temporary local id while
   * uploading. On submit this becomes the value stored against the evidence
   * block (`{ attachments: [id, ...] }`), so it MUST be the real attachment id
   * by the time the form is submitted (validation blocks submit otherwise).
   */
  id: string;
  /**
   * The underlying File object. Undefined for entries restored from a saved
   * draft (the original File is not retained server-side; only the attachment
   * id survives). Such entries render without a preview but still contribute
   * their attachment id on submit.
   */
  file?: File;
  /** Object URL for image previews; empty string for non-image types. */
  previewUrl: string;
  status: EvidenceStatus;
  /** Upload progress 0..100 (only meaningful while status === "uploading"). */
  progress: number;
  /** Server attachment id once uploaded. */
  attachmentId?: string;
  errorMessage?: string;
}

// ── Draft auto-save (v0.5.1 Spec §5.4) ──
//
// When a `draftContext` is supplied, the renderer periodically (and shortly
// after the user stops editing) persists the current answers server-side via
// the `form_submission.save_draft` command. Saving is fully non-blocking: it
// never awaits or prevents form submission. Failures surface only in the
// subtle status indicator in the form header — never as a modal or toast.

type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

export interface DraftContext {
  formDefinitionId: string;
  bindingId?: string;
  subjectType?: string | null;
  subjectId?: string | null;
  workItemId?: string;
}

// ── Props ──

export interface MobileFormRendererProps {
  schema: { blocks: FormBlock[] };
  initialAnswers?: Record<string, unknown>;
  onSubmit: (answers: Record<string, unknown>) => void;
  submitting?: boolean;
  workspaceId?: string;
  /**
   * When provided, enables debounced auto-save of the current answers. The
   * callback receives the renderer's raw internal answers and should persist
   * them (e.g. transform + POST to the save_draft command). Resolves `true` on
   * success and `false` (or rejects) on failure; the renderer handles status
   * indicator transitions and never throws back to the caller.
   */
  draftContext?: DraftContext;
  onSaveDraft?: (answers: Record<string, unknown>) => Promise<boolean>;
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

function isImageType(file?: File): boolean {
  return !!file && file.type.startsWith("image/");
}

function isVideoType(file?: File): boolean {
  return !!file && file.type.startsWith("video/");
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

// ── Upload response envelope ──
// Matches the { success, data } | { success:false, error } shape returned by
// the cloud API helpers (see src/lib/http.ts and @runory/contracts `ok`/`err`).

interface UploadSuccessEnvelope {
  success: true;
  data: {
    attachmentId: string;
    fileName: string;
    contentType: string;
    size: number;
    uploadedAt: string;
  };
}
interface UploadErrorEnvelope {
  success: false;
  error: { code: string; message: string; requestId?: string };
}
type UploadEnvelope = UploadSuccessEnvelope | UploadErrorEnvelope;

// ── Component ──

export function MobileFormRenderer({
  schema,
  initialAnswers,
  onSubmit,
  submitting = false,
  workspaceId,
  draftContext,
  onSaveDraft,
}: MobileFormRendererProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    initialAnswers ?? {}
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { t } = useI18n();

  // Hidden file input refs (one per evidence block for camera + gallery)
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const galleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // In-flight XHRs keyed by entry.localId, so removal/retry can abort them.
  const xhrRefs = useRef<Record<string, XMLHttpRequest | null>>({});

  // ── Draft auto-save (v0.5.1 Spec §5.4) ──
  const [draftStatus, setDraftStatus] = useState<DraftSaveStatus>("idle");
  const draftEnabled = Boolean(draftContext && onSaveDraft);
  // Latest answers/saver kept in refs so the save routine is stable and always
  // operates on current state without re-creating on every keystroke.
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const onSaveDraftRef = useRef(onSaveDraft);
  onSaveDraftRef.current = onSaveDraft;
  // Tracks whether there are unsaved edits since the last successful save.
  const dirtyRef = useRef(false);
  // Debounce timer for change-triggered saves.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against immediately re-saving a just-restored draft on first mount.
  const skipFirstChangeRef = useRef(draftEnabled);

  const doSaveDraft = useCallback(async () => {
    if (!draftContext || !onSaveDraftRef.current) return;
    if (!dirtyRef.current) return;
    setDraftStatus("saving");
    try {
      const ok = await onSaveDraftRef.current(answersRef.current);
      if (ok) {
        dirtyRef.current = false;
        setDraftStatus("saved");
      } else {
        setDraftStatus("error");
      }
    } catch {
      // Errors are surfaced only in the status indicator (Spec §5.4).
      setDraftStatus("error");
    }
  }, [draftContext]);

  // Change-triggered debounced save (a few seconds after the user stops
  // editing). The first effect run after mount is skipped so a restored draft
  // is not immediately re-written back to the server.
  useEffect(() => {
    if (!draftEnabled) return;
    if (skipFirstChangeRef.current) {
      skipFirstChangeRef.current = false;
      return;
    }
    dirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSaveDraft();
    }, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, draftEnabled, doSaveDraft]);

  // Periodic save every 30s while there are unsaved edits (Spec §5.4:
  // "every 30 seconds or when answers change").
  useEffect(() => {
    if (!draftEnabled) return;
    const interval = setInterval(() => {
      void doSaveDraft();
    }, 30000);
    return () => clearInterval(interval);
  }, [draftEnabled, doSaveDraft]);

  // Flush any pending debounced save + clear timers on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

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
          const files = (answers[block.id] as EvidenceEntry[]) ?? [];
          if (required > 0 && files.length < required) {
            nextErrors[block.id] = `At least ${required} attachment(s) required`;
            break;
          }
          // Block submit while any attachment is still uploading or has failed.
          // Evidence ids must be real attachment ids before they are stored
          // against the submission revision (Spec §5.5).
          const pending = files.filter((f) => f.status !== "uploaded");
          if (pending.length > 0) {
            const hasFailed = pending.some((f) => f.status === "error");
            nextErrors[block.id] = hasFailed
              ? "Some attachments failed to upload — retry or remove them"
              : "Wait for uploads to finish";
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

  // Patch a single evidence entry by localId.
  const patchEvidenceEntry = useCallback(
    (blockId: string, localId: string, patch: Partial<EvidenceEntry>) => {
      setAnswers((prev) => {
        const current = (prev[blockId] as EvidenceEntry[]) ?? [];
        return {
          ...prev,
          [blockId]: current.map((e) =>
            e.localId === localId ? { ...e, ...patch } : e
          ),
        };
      });
    },
    []
  );

  // ── Real upload via XMLHttpRequest (progress + retry) ──
  //
  // Per Spec §5.5: "Files show upload progress and explicit retry. Retrying an
  // attachment association MUST be idempotent." The server dedups by sha256, so
  // retrying the same file content resolves to the existing attachment instead
  // of duplicating storage.
  const uploadFile = useCallback(
    (blockId: string, localId: string, file: File) => {
      if (!workspaceId) {
        patchEvidenceEntry(blockId, localId, {
          status: "error",
          errorMessage: "Workspace context is missing — cannot upload.",
        });
        return;
      }

      // Abort any in-flight XHR for this entry (e.g. on retry).
      const existing = xhrRefs.current[localId];
      if (existing) {
        try {
          existing.abort();
        } catch {
          /* ignore */
        }
      }

      const xhr = new XMLHttpRequest();
      xhrRefs.current[localId] = xhr;

      patchEvidenceEntry(blockId, localId, {
        status: "uploading",
        progress: 0,
        errorMessage: undefined,
      });

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          patchEvidenceEntry(blockId, localId, { progress });
        }
      };

      xhr.onload = () => {
        delete xhrRefs.current[localId];
        let envelope: UploadEnvelope | null = null;
        try {
          envelope = JSON.parse(xhr.responseText) as UploadEnvelope;
        } catch {
          envelope = null;
        }

        if (
          xhr.status >= 200 &&
          xhr.status < 300 &&
          envelope &&
          envelope.success &&
          envelope.data?.attachmentId
        ) {
          const attachmentId = envelope.data.attachmentId;
          patchEvidenceEntry(blockId, localId, {
            status: "uploaded",
            progress: 100,
            attachmentId,
            // The entry id becomes the real attachment id so that on submit the
            // evidence block stores attachment ids, not local temp ids.
            id: attachmentId,
          });
        } else {
          const message =
            (envelope && !envelope.success && envelope.error?.message) ||
            `Upload failed (HTTP ${xhr.status})`;
          patchEvidenceEntry(blockId, localId, {
            status: "error",
            errorMessage: message,
          });
        }
      };

      xhr.onerror = () => {
        delete xhrRefs.current[localId];
        patchEvidenceEntry(blockId, localId, {
          status: "error",
          errorMessage: "Network error during upload.",
        });
      };

      xhr.onabort = () => {
        delete xhrRefs.current[localId];
        patchEvidenceEntry(blockId, localId, {
          status: "error",
          errorMessage: "Upload cancelled.",
        });
      };

      const formData = new FormData();
      formData.append("file", file);
      xhr.open("POST", `/api/workspaces/${workspaceId}/uploads`);
      xhr.send(formData);
    },
    [workspaceId, patchEvidenceEntry]
  );

  const handleFilesSelected = useCallback(
    (block: FormBlock, fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const accept = block.accepted_types ?? ["image/*"];

      const current = (answers[block.id] as EvidenceEntry[]) ?? [];
      const newEntries: EvidenceEntry[] = [];

      for (const file of Array.from(fileList)) {
        // Basic type filtering: accept if the block allows image/* or the
        // file's MIME type is explicitly in the accepted_types list.
        if (
          !accept.includes("image/*") &&
          !accept.some((t) => file.type === t || file.type.startsWith(t.replace(/\/$/, "")))
        ) {
          continue;
        }
        const localId = genId("ev");
        newEntries.push({
          localId,
          id: localId, // temporary; replaced by attachment id on success
          file,
          previewUrl: isImageType(file) ? URL.createObjectURL(file) : "",
          status: "uploading",
          progress: 0,
        });
      }

      if (newEntries.length === 0) return;

      setAnswer(block.id, [...current, ...newEntries]);

      // Kick off uploads for each new entry (after state is queued).
      for (const entry of newEntries) {
        if (entry.file) uploadFile(block.id, entry.localId, entry.file);
      }
    },
    [answers, setAnswer, uploadFile]
  );

  const retryEvidenceFile = useCallback(
    (block: FormBlock, localId: string) => {
      const current = (answers[block.id] as EvidenceEntry[]) ?? [];
      const entry = current.find((e) => e.localId === localId);
      if (!entry || !entry.file) return;
      // Idempotent retry: server dedups by sha256, so re-uploading the same
      // content either creates the attachment or returns the existing one.
      uploadFile(block.id, localId, entry.file);
    },
    [answers, uploadFile]
  );

  const removeEvidenceFile = useCallback(
    (block: FormBlock, localId: string) => {
      const current = (answers[block.id] as EvidenceEntry[]) ?? [];
      const entry = current.find((e) => e.localId === localId);

      // Abort any in-flight upload and release the object URL.
      const xhr = xhrRefs.current[localId];
      if (xhr) {
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
        delete xhrRefs.current[localId];
      }
      if (entry?.previewUrl) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      setAnswer(
        block.id,
        current.filter((e) => e.localId !== localId)
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
    const required = block.required_count ?? 0;
    const uploadedCount = files.filter((f) => f.status === "uploaded").length;
    const isUploading = files.some((f) => f.status === "uploading");

    // Gallery input accepts the full server whitelist unless the form author
    // restricted accepted_types. The camera input stays image-only because
    // capture="environment" only makes sense for photos.
    const galleryAccept =
      block.accepted_types && block.accepted_types.length > 0
        ? block.accepted_types.join(",")
        : "image/*,application/pdf,video/mp4";

    return (
      <div data-error-key={block.id}>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="flex items-center gap-1 text-sm font-semibold text-slate-700">
            {block.label}
            {required > 0 && (
              <span className="ml-1 text-xs font-normal text-slate-400">
                ({uploadedCount}/{required})
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
            Attach File
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
          accept={galleryAccept}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(block, e.target.files);
            e.target.value = "";
          }}
        />

        {/* Block-level upload indicator */}
        {isUploading && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2">
            <Loader2 size={14} className="animate-spin text-indigo-600" />
            <span className="text-xs font-medium text-indigo-700">
              Uploading…
            </span>
          </div>
        )}

        {/* File previews */}
        {files.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {files.map((entry) => {
              const isImage = isImageType(entry.file);
              const isVideo = isVideoType(entry.file);
              const isFailed = entry.status === "error";
              // Entries restored from a saved draft have no local File object —
              // only the server attachment id survives. They render without a
              // preview but still submit their attachment id.
              const isRecovered = !entry.file;

              return (
                <div
                  key={entry.localId}
                  className={`group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border bg-slate-100 ${
                    isFailed
                      ? "border-red-400 bg-red-50"
                      : entry.status === "uploaded"
                        ? "border-green-300"
                        : "border-slate-200"
                  }`}
                >
                  {/* Preview / file icon */}
                  {isImage && entry.previewUrl ? (
                    <img
                      src={entry.previewUrl}
                      alt={entry.file?.name ?? "attachment"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 px-1 text-center">
                      {isRecovered ? (
                        <CheckCircle2 size={20} className="text-green-500" />
                      ) : isVideo ? (
                        <Film size={20} className="text-slate-500" />
                      ) : (
                        <FileText size={20} className="text-slate-500" />
                      )}
                      <span className="line-clamp-2 text-[9px] font-medium text-slate-600">
                        {isRecovered
                          ? (entry.attachmentId ?? entry.id).slice(0, 12)
                          : entry.file?.name}
                      </span>
                    </div>
                  )}

                  {/* Upload progress overlay */}
                  {entry.status === "uploading" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50">
                      <Loader2
                        size={16}
                        className="animate-spin text-white"
                      />
                      <span className="text-[10px] font-semibold text-white">
                        {entry.progress}%
                      </span>
                      <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/30">
                        <div
                          className="h-full rounded-full bg-white transition-all"
                          style={{ width: `${entry.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error overlay */}
                  {isFailed && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-50/90 px-1 text-center">
                      <AlertCircle size={16} className="text-red-600" />
                      <span className="line-clamp-2 text-[9px] font-medium text-red-700">
                        {entry.errorMessage ?? "Upload failed"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          retryEvidenceFile(block, entry.localId)
                        }
                        className="mt-0.5 flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[9px] font-semibold text-white active:bg-red-700"
                      >
                        <RefreshCw size={10} />
                        Retry
                      </button>
                    </div>
                  )}

                  {/* Remove button */}
                  {entry.status !== "uploading" && (
                    <button
                      type="button"
                      onClick={() => removeEvidenceFile(block, entry.localId)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
                      aria-label="Remove attachment"
                    >
                      <X size={14} />
                    </button>
                  )}

                  {/* Uploaded check + size footer */}
                  <p className="absolute bottom-0 left-0 right-0 flex items-center gap-1 truncate bg-black/50 px-1 py-0.5 text-[9px] text-white">
                    {entry.status === "uploaded" && (
                      <Check size={9} className="shrink-0 text-green-300" />
                    )}
                    <span className="truncate">
                      {entry.file ? formatFileSize(entry.file.size) : "—"}
                    </span>
                  </p>
                </div>
              );
            })}
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
    [schema.blocks, answers, errors]
  );

  // ── Draft save status indicator (v0.5.1 Spec §5.4) ──
  // Subtle, non-blocking status shown only while a draft is being persisted
  // or after a save has settled. Hidden entirely when auto-save is disabled or
  // before the first save so it never competes with form content for attention.
  const renderDraftIndicator = () => {
    if (!draftEnabled || draftStatus === "idle") return null;
    let icon: React.ReactNode = null;
    let text = "";
    let className = "text-slate-400";
    if (draftStatus === "saving") {
      icon = <Loader2 size={12} className="animate-spin" />;
      text = t("form.draftSaving");
      className = "text-indigo-500";
    } else if (draftStatus === "saved") {
      icon = <CheckCircle2 size={12} />;
      text = t("form.draftSaved");
      className = "text-slate-400";
    } else if (draftStatus === "error") {
      icon = <AlertCircle size={12} />;
      text = t("form.draftSaveFailed");
      className = "text-red-500";
    }
    return (
      <div className="flex items-center justify-end px-1 -mt-1 mb-1">
        <span
          role="status"
          aria-live="polite"
          className={`flex items-center gap-1 text-[11px] font-medium ${className}`}
        >
          {icon}
          {text}
        </span>
      </div>
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Form body */}
      <div className="flex-1 space-y-4 px-4 py-4">
        {renderDraftIndicator()}
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
