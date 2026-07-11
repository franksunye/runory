"use client";

// Public form renderer (block-based forms).
//
// Renders a form definition's blocks (header / field / checklist / evidence /
// signature) and submits the answers to the existing public submit endpoint
// (`/api/public/forms/[formId]/submit`), which already understands form
// definitions.
//
// Answer conventions (must match `validateAnswers` in
// @runory/platform-core/src/forms.ts):
//   - field blocks:      answers[field_key ?? id] = typed value
//   - checklist blocks:  answers[block.id] = { [itemId]: "pass"|"fail"|"na" }
//   - evidence blocks:   answers[block.id] = { attachments: string[] }
//   - signature blocks:  answers[block.id] = { acknowledged: boolean }

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { FormBlock } from "@runory/contracts";

interface FormBlockRendererProps {
  blocks: FormBlock[];
  formId: string;
  landingPageId: string;
  submitButtonLabel: string;
  successMessage: string;
  consentLabel: string;
  defaultError: string;
  networkError: string;
  honeypotField: string;
}

// Heuristic for choosing a taller textarea. There is no explicit "long text"
// flag on a V2 field block, so we infer it from the field key / label.
const LONG_TEXT_KEYWORDS = [
  "description",
  "message",
  "summary",
  "details",
  "comment",
  "resolution",
  "notes",
  "remark",
  "feedback",
  "address",
];

function isLongTextField(
  key: string | undefined,
  label: string | undefined
): boolean {
  const haystack = `${key ?? ""} ${label ?? ""}`.toLowerCase();
  return LONG_TEXT_KEYWORDS.some((kw) => haystack.includes(kw));
}

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelClass = "block text-sm font-medium text-slate-700";

type ChecklistItem = NonNullable<FormBlock["items"]>[number];

export function FormBlockRenderer({
  blocks,
  formId,
  landingPageId,
  submitButtonLabel,
  successMessage,
  consentLabel,
  defaultError,
  networkError,
  honeypotField,
}: FormBlockRendererProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-block signature acknowledgement flag (block.id -> acknowledged).
  const [signatureAck, setSignatureAck] = useState<Record<string, boolean>>(
    {}
  );

  const setFieldValue = (key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const setChecklistValue = (
    blockId: string,
    itemId: string,
    value: string
  ) => {
    setAnswers((prev) => {
      const current =
        (prev[blockId] as Record<string, string> | undefined) ?? {};
      return { ...prev, [blockId]: { ...current, [itemId]: value } };
    });
  };

  const setEvidenceAttachments = (
    blockId: string,
    files: FileList | null
  ) => {
    const names = files ? Array.from(files).map((f) => f.name) : [];
    setAnswers((prev) => ({ ...prev, [blockId]: { attachments: names } }));
  };

  const onSignatureChange = (blockId: string, ack: boolean) => {
    setSignatureAck((prev) => ({ ...prev, [blockId]: ack }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setError(null);

    if (!consent) {
      setError(defaultError);
      return;
    }

    // Merge signature acknowledgements into the answers payload.
    const finalAnswers: Record<string, unknown> = { ...answers };
    for (const [blockId, ack] of Object.entries(signatureAck)) {
      finalAnswers[blockId] = { acknowledged: ack };
    }

    const payload: Record<string, unknown> = { ...finalAnswers };
    payload[honeypotField] = honeypot;
    payload._consent = consent;
    payload._consent_text = consentLabel;
    payload._landing_page_id = landingPageId;
    payload._source_url =
      typeof window !== "undefined" ? window.location.href : "";

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/forms/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(true);
        setAnswers({});
        setSignatureAck({});
        setConsent(false);
        setHoneypot("");
      } else {
        setError(json.error?.message ?? defaultError);
      }
    } catch {
      setError(networkError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          answers={answers}
          signatureAck={signatureAck[block.id] ?? false}
          onFieldChange={setFieldValue}
          onChecklistChange={setChecklistValue}
          onEvidenceChange={setEvidenceAttachments}
          onSignatureChange={(ack) => onSignatureChange(block.id, ack)}
        />
      ))}

      {/* Honeypot field (hidden from humans) */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor={honeypotField}>Website</label>
        <input
          id={honeypotField}
          name={honeypotField}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {/* Consent checkbox */}
      <div className="flex items-start">
        <input
          id="_consent_v2"
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="_consent_v2" className="ml-2 text-sm text-slate-600">
          {consentLabel}
        </label>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitButtonLabel}
      </button>
    </form>
  );
}

// ── Block view ──

interface BlockViewProps {
  block: FormBlock;
  answers: Record<string, unknown>;
  signatureAck: boolean;
  onFieldChange: (key: string, value: unknown) => void;
  onChecklistChange: (blockId: string, itemId: string, value: string) => void;
  onEvidenceChange: (blockId: string, files: FileList | null) => void;
  onSignatureChange: (ack: boolean) => void;
}

function BlockView({
  block,
  answers,
  signatureAck,
  onFieldChange,
  onChecklistChange,
  onEvidenceChange,
  onSignatureChange,
}: BlockViewProps) {
  switch (block.block_type) {
    case "header":
      return block.label ? (
        <h3 className="border-b border-slate-200 pb-2 text-lg font-semibold text-slate-900">
          {block.label}
        </h3>
      ) : null;

    case "field": {
      const key = block.field_key ?? block.id;
      return (
        <div>
          {block.label && (
            <label htmlFor={block.id} className={labelClass}>
              {block.label}
              {block.required && (
                <span className="ml-1 text-red-500">*</span>
              )}
            </label>
          )}
          <FieldInput
            block={block}
            value={answers[key]}
            onChange={(v) => onFieldChange(key, v)}
          />
        </div>
      );
    }

    case "checklist":
      return (
        <div>
          {block.label && <p className={labelClass}>{block.label}</p>}
          <div className="mt-2 space-y-3">
            {(block.items ?? []).map((item) => (
              <ChecklistItemView
                key={item.id}
                blockId={block.id}
                item={item}
                answers={answers}
                onChecklistChange={onChecklistChange}
              />
            ))}
          </div>
        </div>
      );

    case "evidence": {
      const accepted = (block.accepted_types ?? []).join(",");
      return (
        <div>
          {block.label && (
            <label htmlFor={block.id} className={labelClass}>
              {block.label}
              {block.required && (
                <span className="ml-1 text-red-500">*</span>
              )}
            </label>
          )}
          <input
            id={block.id}
            type="file"
            multiple
            accept={accepted || undefined}
            onChange={(e) => onEvidenceChange(block.id, e.target.files)}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
          />
          {block.required_count ? (
            <p className="mt-1 text-xs text-slate-500">
              Upload at least {block.required_count} file(s)
              {block.accepted_types && block.accepted_types.length > 0
                ? ` (accepted: ${block.accepted_types.join(", ")})`
                : ""}
              .
            </p>
          ) : null}
        </div>
      );
    }

    case "signature":
      return (
        <div>
          {block.label && <p className={labelClass}>{block.label}</p>}
          <SignaturePad
            acknowledgmentText={block.acknowledgment_text}
            required={block.required}
            acknowledged={signatureAck}
            onChange={onSignatureChange}
          />
        </div>
      );

    default:
      return null;
  }
}

// ── Field input ──

function FieldInput({
  block,
  value,
  onChange,
}: {
  block: FormBlock;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const fieldType = block.field_type ?? "text";
  const strValue =
    typeof value === "string" ? value : value == null ? "" : String(value);
  const name = block.field_key ?? block.id;

  switch (fieldType) {
    case "text":
      return (
        <textarea
          id={block.id}
          name={name}
          required={block.required}
          rows={isLongTextField(block.field_key, block.label) ? 4 : 1}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
    case "number":
      return (
        <input
          id={block.id}
          name={name}
          type="number"
          required={block.required}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
    case "date":
      return (
        <input
          id={block.id}
          name={name}
          type="date"
          required={block.required}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
    case "select":
      return (
        <select
          id={block.id}
          name={name}
          required={block.required}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Select…
          </option>
          {(block.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <input
          id={block.id}
          name={name}
          type="checkbox"
          required={block.required}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
      );
    default:
      return null;
  }
}

// ── Checklist item ──

function ChecklistItemView({
  blockId,
  item,
  answers,
  onChecklistChange,
}: {
  blockId: string;
  item: ChecklistItem;
  answers: Record<string, unknown>;
  onChecklistChange: (blockId: string, itemId: string, value: string) => void;
}) {
  const blockAnswers =
    (answers[blockId] as Record<string, string> | undefined) ?? {};
  const current = blockAnswers[item.id];

  if (item.pass_fail_na) {
    const options: Array<{ key: "pass" | "fail" | "na"; label: string }> = [
      { key: "pass", label: "Pass" },
      { key: "fail", label: "Fail" },
      { key: "na", label: "N/A" },
    ];
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-sm text-slate-700">
          {item.label}
          {item.required && <span className="ml-1 text-red-500">*</span>}
        </span>
        <div className="flex gap-1">
          {options.map((opt) => {
            const active = current === opt.key;
            const activeClass =
              opt.key === "pass"
                ? "border-green-600 bg-green-600 text-white"
                : opt.key === "fail"
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-slate-500 bg-slate-500 text-white";
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => onChecklistChange(blockId, item.id, opt.key)}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? activeClass
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Simple checkbox — checked = "pass", unchecked = "" (treated as missing
  // by the backend for required items, ignored for optional ones).
  return (
    <div className="flex items-center gap-2">
      <input
        id={item.id}
        type="checkbox"
        checked={current === "pass"}
        onChange={(e) =>
          onChecklistChange(blockId, item.id, e.target.checked ? "pass" : "")
        }
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <label htmlFor={item.id} className="text-sm text-slate-700">
        {item.label}
        {item.required && <span className="ml-1 text-red-500">*</span>}
      </label>
    </div>
  );
}

// ── Signature pad ──

function SignaturePad({
  acknowledgmentText,
  required,
  acknowledged,
  onChange,
}: {
  acknowledgmentText?: string;
  required?: boolean;
  acknowledged: boolean;
  onChange: (ack: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasSigRef = useRef(false);

  // Initialize canvas resolution to match its displayed size (HiDPI aware).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    ctx.scale(ratio, ratio);
  }, []);

  // Clear the canvas when the parent resets the acknowledgement state
  // (e.g. after a successful submission resets signature state).
  useEffect(() => {
    if (acknowledged) return;
    if (!hasSigRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSigRef.current = false;
  }, [acknowledged]);

  const pointerPos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore — pointer capture not supported */
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = pointerPos(e);
    if (!p) return;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawingRef.current = true;
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = pointerPos(e);
    if (!p) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasSigRef.current) {
      hasSigRef.current = true;
      onChange(true);
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSigRef.current = false;
    onChange(false);
  };

  return (
    <div>
      {acknowledgmentText && (
        <p className="mb-2 text-sm text-slate-600">{acknowledgmentText}</p>
      )}
      <canvas
        ref={canvasRef}
        className="block w-full touch-none rounded-md border border-slate-300 bg-white"
        style={{ height: "160px" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {required ? "Signature required" : "Sign above"}
        </span>
        <button
          type="button"
          onClick={clear}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
