"use client";

// ── Mobile Form Submission Page (v0.5.1) ──
//
// Per v0.5.1 Mobile Field-Work Spec §4.2 & §5.5:
// Fetches the work item, resolves its form binding to a Forms 2.0 definition,
// renders the MobileFormRenderer, and on submit creates an immutable form
// submission then completes the work item.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  FileText,
} from "lucide-react";
import type { FormBlock } from "@runory/contracts";
import { MobileFormRenderer } from "@/components/forms/MobileFormRenderer";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";

export const dynamic = "force-dynamic";

// ── Types ──

interface WorkItemDetail {
  id: string;
  workspace_id: string;
  instance_id: string;
  step_id: string;
  kind: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
  assignee_type: string | null;
  assignee_id: string | null;
  candidate_rule_json: string | null;
  due_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  form_binding_id: string | null;
  input_snapshot_json: string | null;
  input_snapshot_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface FormDefinitionMeta {
  id: string;
  form_key: string;
  name: string;
  status: string;
}

interface FormSchemaData {
  blocks: FormBlock[];
}

interface EvidenceEntryLike {
  id: string;
  file: File;
  previewUrl: string;
}

interface ChecklistItemAnswerLike {
  result: "pass" | "fail" | "na" | null;
  notes: string;
}

interface SignatureAnswerLike {
  signerLabel: string;
  acknowledged: boolean;
  timestamp: string;
}

type PageState = "loading" | "ready" | "submitting" | "success" | "error";

// ── Answer transformation ──
//
// Converts the MobileFormRenderer's internal answer format into the structure
// expected by the backend submitForm / validateAnswers conventions:
//  - Field blocks:   answers[field_key ?? block.id] = typed value
//  - Checklist blocks: answers[block.id] = { [itemId]: "pass"|"fail"|"na" }
//  - Evidence blocks:  answers[block.id] = { attachments: string[] }
//  - Signature blocks: answers[block.id] = { acknowledged, signedBy, timestamp }

function transformAnswers(
  blocks: FormBlock[],
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const block of blocks) {
    switch (block.block_type) {
      case "field": {
        const key = block.field_key ?? block.id;
        out[key] = raw[key];
        break;
      }

      case "checklist": {
        const blockAnswers = raw[block.id] as
          | Record<string, ChecklistItemAnswerLike>
          | undefined;
        if (blockAnswers) {
          const simplified: Record<string, string> = {};
          for (const [itemId, val] of Object.entries(blockAnswers)) {
            if (val?.result) {
              simplified[itemId] = val.result;
            }
          }
          out[block.id] = simplified;
        }
        break;
      }

      case "evidence": {
        const entries = raw[block.id] as EvidenceEntryLike[] | undefined;
        if (entries && entries.length > 0) {
          out[block.id] = {
            attachments: entries.map((e) => e.id),
          };
        }
        break;
      }

      case "signature": {
        const sig = raw[block.id] as SignatureAnswerLike | undefined;
        if (sig) {
          out[block.id] = {
            acknowledged: sig.acknowledged,
            signedBy: sig.signerLabel,
            timestamp: sig.timestamp,
          };
        }
        break;
      }

      case "header":
      default:
        break;
    }
  }

  return out;
}

// ── Page (Suspense wrapper) ──

export default function MobileFormPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      }
    >
      <MobileFormPage />
    </Suspense>
  );
}

// ── Page ──

function MobileFormPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const workItemId = params.workItemId as string;
  const router = useRouter();

  const [state, setState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workItem, setWorkItem] = useState<WorkItemDetail | null>(null);
  const [formDefId, setFormDefId] = useState<string | null>(null);
  const [formName, setFormName] = useState<string>("");
  const [schema, setSchema] = useState<FormSchemaData | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      window.setTimeout(() => setToast(null), 3000);
    },
    []
  );

  // ── Load work item + form definition ──

  const load = useCallback(async () => {
    try {
      setState("loading");
      setErrorMessage(null);

      // 1. Fetch the work item
      const wiRes = await fetch(
        `/api/workspaces/${workspaceId}/my-work/${workItemId}`,
        { cache: "no-store" }
      );
      const wiJson = await wiRes.json();
      if (!wiJson.success) {
        throw new Error(
          wiJson.error?.message ?? "Failed to load work item"
        );
      }
      const item = wiJson.data as WorkItemDetail;
      setWorkItem(item);

      if (!item.form_binding_id) {
        throw new Error(
          "This work item has no form binding. A form definition is required to render the form."
        );
      }

      // 2. Resolve form binding → form definition (fetch both lists in parallel)
      const [bindingsRes, definitionsRes] = await Promise.all([
        fetch(
          `/api/workspaces/${workspaceId}/forms/bindings`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/workspaces/${workspaceId}/forms/definitions`,
          { cache: "no-store" }
        ),
      ]);

      const bindingsJson = await bindingsRes.json();
      const definitionsJson = await definitionsRes.json();

      if (!bindingsJson.success || !definitionsJson.success) {
        throw new Error("Failed to load form bindings or definitions");
      }

      const binding = (bindingsJson.data as Array<Record<string, unknown>>)
        .find((b) => b.id === item.form_binding_id);
      if (!binding) {
        throw new Error(
          `Form binding not found: ${item.form_binding_id}`
        );
      }
      const definitionId = binding.form_definition_id as string;

      const defMeta = (
        definitionsJson.data as Array<Record<string, unknown>>
      ).find((d) => d.id === definitionId);
      if (!defMeta) {
        throw new Error(
          `Form definition not found: ${definitionId}`
        );
      }
      const formKey = defMeta.form_key as string;

      // 3. Fetch the full definition (with schema) by form_key
      const defRes = await fetch(
        `/api/workspaces/${workspaceId}/forms/definitions/${formKey}`,
        { cache: "no-store" }
      );
      const defJson = await defRes.json();
      if (!defJson.success) {
        throw new Error("Failed to load form definition schema");
      }

      const definition = defJson.data.definition as FormDefinitionMeta;
      const formSchema = defJson.data.schema as FormSchemaData;

      setFormDefId(definition.id);
      setFormName(definition.name ?? formKey);
      setSchema(formSchema);
      setState("ready");
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : "An unexpected error occurred"
      );
      setState("error");
    }
  }, [workspaceId, workItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Submit handler ──

  const handleSubmit = useCallback(
    async (rawAnswers: Record<string, unknown>) => {
      if (!workItem || !formDefId || !schema) return;

      try {
        setState("submitting");

        // Transform answers to backend-expected format
        const transformed = transformAnswers(schema.blocks, rawAnswers);

        // 1. Submit the form (creates an immutable, revisioned submission)
        const subRes = await fetch(
          `/api/workspaces/${workspaceId}/forms/submissions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              formDefinitionId: formDefId,
              subjectType: workItem.subject_type ?? undefined,
              subjectId: workItem.subject_id ?? undefined,
              workItemId: workItem.id,
              bindingId: workItem.form_binding_id ?? undefined,
              answers: transformed,
            }),
          }
        );
        const subJson = await subRes.json();
        if (!subJson.success) {
          throw new Error(
            subJson.error?.message ?? "Form submission failed"
          );
        }

        // 2. Complete the work item to advance the workflow
        const completeRes = await fetch(
          `/api/workspaces/${workspaceId}/work-items/${workItem.id}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedVersion: workItem.version,
            }),
          }
        );
        const completeJson = await completeRes.json();
        if (!completeJson.success) {
          // The form was submitted but the work item couldn't be completed.
          // Per v0.5.1 Spec §5.4: "The UI MUST never claim a governed action
          // succeeded until the server command succeeds."
          // Show a failure state, not a success state.
          throw new Error(
            completeJson.error?.message ??
              "Work item completion failed. The form was saved but the work item could not be completed. Contact your administrator."
          );
        }

        notifyWorkspaceDataChanged();
        setState("success");
      } catch (e) {
        showToast(
          "error",
          e instanceof Error ? e.message : "Submission failed"
        );
        setState("ready");
      }
    },
    [workItem, formDefId, schema, workspaceId, showToast]
  );

  // ── Render ──

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 top-4 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
          style={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
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
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="app-eyebrow">Forms 2.0</p>
            <h1 className="mt-0.5 truncate text-base font-bold text-slate-900">
              {formName || "Form"}
            </h1>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1">
        {state === "loading" && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-slate-400" />
            <p className="mt-3 text-xs text-slate-400">Loading form…</p>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-center text-sm text-red-600">
              {errorMessage ?? "Failed to load form"}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => void load()}
                className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
              >
                Retry
              </button>
              <button
                onClick={() =>
                  router.push(`/m/w/${workspaceId}/work/${workItemId}`)
                }
                className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
              >
                Back to Work Item
              </button>
            </div>
          </div>
        )}

        {state === "success" && (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 size={40} className="text-green-600" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-900">
                Form Submitted
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your form has been submitted and the work item is marked
                complete.
              </p>
            </div>
            <button
              onClick={() => router.push(`/m/w/${workspaceId}`)}
              className="flex min-h-[48px] w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 active:bg-indigo-700"
            >
              <FileText size={16} />
              Back to My Work
            </button>
          </div>
        )}

        {state === "ready" && schema && (
          <MobileFormRenderer
            schema={schema}
            onSubmit={(answers) => void handleSubmit(answers)}
            submitting={false}
            workspaceId={workspaceId}
          />
        )}

        {state === "submitting" && schema && (
          <div className="relative">
            <div className="pointer-events-none opacity-60">
              <MobileFormRenderer
                schema={schema}
                onSubmit={() => {}}
                submitting={true}
                workspaceId={workspaceId}
              />
            </div>
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20">
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-6 shadow-xl">
                <Loader2 size={28} className="animate-spin text-indigo-600" />
                <p className="text-sm font-semibold text-slate-700">
                  Submitting form…
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
