"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  MapPin,
  Minus,
  Navigation,
  PenLine,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import useSWR from "swr";
import SchemaForm from "./SchemaForm";
import SchemaTable from "./SchemaTable";
import UserAvatar from "./UserAvatar";
import RecordWorkflowPanel from "./RecordWorkflowPanel";
import RecordTimelineSection, { isValidTimelineSubject } from "./RecordTimelineSection";
import type { FieldDefinition } from "@runory/platform-core";
import type { FormBlock } from "@runory/contracts";
import {
  useFields,
  useViews,
  useRecord,
  useRecords,
  useRelations,
  useWorkspaceAccess,
  useWorkspaceChangeEvent,
  type WorkspaceRecord,
} from "@/lib/api-hooks";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useI18n } from "@/i18n/locale-provider";
import type { Locale } from "@/i18n/config";
import { objectKeyToRouteSegment } from "@/lib/dynamic-object";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch, apiDelete, apiPost } from "@/lib/api-fetch";

// Maps object keys to i18n label keys for backlink panel labels.
// Without this, backlink panels show the relation's child→parent label
// (e.g. "Related Company") instead of the correct parent→child label
// (e.g. "Related Deals").
const OBJECT_KEY_LABEL: Record<string, MessageKey> = {
  company: "workspace.nav.objectCompany",
  contact: "workspace.nav.objectContact",
  deal: "workspace.nav.objectDeal",
  task: "workspace.nav.objectTask",
  customer: "workspace.nav.objectCustomer",
  asset: "workspace.nav.objectAsset",
  "work-order": "workspace.nav.objectWorkOrder",
  work_order: "workspace.nav.objectWorkOrder",
  "service-site": "workspace.nav.objectServiceSite",
  service_site: "workspace.nav.objectServiceSite",
  technician: "workspace.nav.objectTechnician",
  "service-report": "workspace.nav.objectServiceReport",
  service_report: "workspace.nav.objectServiceReport",
  "service-visit": "workspace.nav.objectServiceVisit",
  service_visit: "workspace.nav.objectServiceVisit",
  campaign: "workspace.nav.objectCampaign",
  "landing-page": "workspace.nav.objectLandingPage",
  form: "workspace.nav.objectForm",
  submission: "workspace.nav.objectSubmission",
  ticket: "workspace.nav.objectTicket",
  conversation: "workspace.nav.objectConversation",
  knowledge: "workspace.nav.objectKnowledge",
  "product-service": "workspace.nav.objectProductService",
  product_service: "workspace.nav.objectProductService",
  "price-book": "workspace.nav.objectPriceBook",
  price_book: "workspace.nav.objectPriceBook",
  price_book_item: "workspace.nav.objectPriceBookItem",
  quote: "workspace.nav.objectQuote",
  quote_line: "workspace.nav.objectQuoteLine",
  "quote-approval": "workspace.nav.objectQuoteApproval",
  "entity-profile": "workspace.nav.objectEntityProfile",
  "citation-source": "workspace.nav.objectCitationSource",
  "answer-block": "workspace.nav.objectAnswerBlock",
  "question-map": "workspace.nav.objectQuestionMap",
  "ai-visibility-check": "workspace.nav.objectAiVisibilityCheck",
  "return-request": "workspace.nav.objectReturnRequest",
  "repair-request": "workspace.nav.objectRepairRequest",
  warranty: "workspace.nav.objectWarranty",
  "maintenance-plan": "workspace.nav.objectMaintenancePlan",
  "customer-success": "workspace.nav.objectCustomerSuccess",
  "support-sla": "workspace.nav.objectSupportSla",
  consent: "workspace.nav.objectConsent",
};

function getObjectLabel(objectKey: string, t: (key: MessageKey) => string): string {
  const key = OBJECT_KEY_LABEL[objectKey];
  return key ? t(key) : objectKey;
}

function formatMetaDate(value: string | number | boolean | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export interface ParentLinkConfig {
  /** Field on this record that holds the parent record's id */
  foreignKey: string;
  /** Object key of the parent (e.g. "company") */
  parentObjectKey: string;
  /** Section label, e.g. "Related companies" */
  label: string;
  /** Field on the parent record to display as link text */
  titleField?: string;
  /** Route base for the link, e.g. "/w/{workspaceId}/companies" */
  routeBase: string;
}

export interface RelatedRecordsConfig {
  /** Object key to fetch (e.g. "contact") */
  objectKey: string;
  /** Field on the related record that points back to this record's id */
  foreignKey: string;
  /** Section heading, e.g. "Related contacts" */
  label: string;
  /** Field to display as the link text */
  titleField?: string;
  /** Route base for links, e.g. "/w/{workspaceId}/contacts" — workspaceId will be substituted */
  routeBase: string;
  /** Optional secondary fields to show after the title */
  secondaryFields?: string[];
  composition?: {
    columns: Array<{ field: string; label?: string }>;
    allowCreate: boolean;
  };
  backlinkPresentation?: {
    mode: "compact" | "summary" | "hidden";
    columns?: Array<{ field: string; label?: string }>;
    limit: number;
  };
}

const DISPLAY_FIELD_CANDIDATES = [
  "name",
  "title",
  "subject",
  "summary",
  "number",
  "code",
  "email",
  "label",
];

// Browser-safe presentation metadata. The platform-core guard remains the
// authority that enforces these constraints on the server. Keep this aligned
// with packages/platform-core/src/governed-fields.ts so forms don't offer an
// edit that the command model must reject.
const GOVERNED_FIELD_KEYS: Record<string, string[]> = {
  quote: ["status", "aggregate_version", "subtotal", "discount_total", "tax_total", "grand_total", "approved_at", "accepted_at", "rejected_reason", "withdrawn_at", "snapshot_hash", "locked_at", "root_quote_id", "previous_version_id", "revision_number", "price_book_id", "currency"],
  work_order: ["status", "aggregate_version", "source_type", "source_id", "source_snapshot_hash", "owner_resource_id", "completed_at", "cancelled_at", "reopened_at", "completion_reason", "cancellation_reason", "reopen_reason"],
  service_visit: ["status", "aggregate_version", "assignment_id", "schedule_entry_id", "outcome", "actual_start", "actual_end"],
};

// Work Order assignment/schedule scalar fields are retained only for legacy
// data compatibility. New FSM work is represented by Service Visit +
// Assignment + Schedule Entry, so showing empty legacy values beside the real
// Visit is actively misleading.
const CANONICAL_DETAIL_HIDDEN_FIELDS: Record<string, Set<string>> = {
  work_order: new Set(["assigned_to", "scheduled_start", "scheduled_end"]),
};

function getDisplayField(fields: FieldDefinition[], preferred?: string): string {
  if (preferred && fields.some((field) => field.fieldKey === preferred)) return preferred;
  return DISPLAY_FIELD_CANDIDATES.find((candidate) =>
    fields.some((field) => field.fieldKey === candidate)
  ) ?? "id";
}

export interface ObjectDetailPageProps {
  objectKey: string;
  viewKey: string;
  basePath: string;
  title: string;
  /** Singular noun shown in delete confirm, e.g. "company" */
  singularLabel?: string;
  backLabel?: string;
  /** Optional parent-record links (e.g. contact → company) */
  parentLinks?: ParentLinkConfig[];
  /** Optional related-records panels */
  related?: RelatedRecordsConfig[];
}

function ParentLinkPanel({
  workspaceId,
  record,
  config,
}: {
  workspaceId: string;
  record: WorkspaceRecord;
  config: ParentLinkConfig;
}) {
  const { t } = useI18n();
  const parentId = record[config.foreignKey] as string | undefined;
  const { data: parentDetail } = useFields(workspaceId, config.parentObjectKey);
  const { data: parentRecord } = useSWR<WorkspaceRecord>(
    parentId ? `/api/workspaces/${workspaceId}/objects/${config.parentObjectKey}/records/${parentId}` : null
  );
  if (!parentId) return null;
  const displayField = getDisplayField(parentDetail?.fields ?? [], config.titleField);
  const routeBase = config.routeBase.replace("{workspaceId}", workspaceId);
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{config.label}</p>
      <div className="mt-1 text-sm">
        {parentRecord ? (
          <Link
            href={`${routeBase}/${parentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 hover:text-indigo-800"
          >
            {String(parentRecord[displayField] ?? parentId)}
          </Link>
        ) : (
          <span className="text-slate-400">{t("workspace.loading")}</span>
        )}
      </div>
    </div>
  );
}

function RelatedRecordsPanel({
  workspaceId,
  parentObjectKey,
  recordId,
  config,
}: {
  workspaceId: string;
  parentObjectKey: string;
  recordId: string;
  config: RelatedRecordsConfig;
}) {
  const { t } = useI18n();
  const { data: relatedDetail } = useFields(workspaceId, config.objectKey);
  const { data: workspaceAccess } = useWorkspaceAccess(workspaceId);
  const compactLimit = config.backlinkPresentation?.mode === "compact"
    ? config.backlinkPresentation.limit
    : undefined;
  const { data: allRecords = [] } = useRecords(workspaceId, config.objectKey, {
    filters: { [config.foreignKey]: recordId },
    // Fetch one extra row so the panel can indicate that more results exist
    // without loading an unbounded transactional collection.
    limit: compactLimit ? compactLimit + 1 : undefined,
  });
  const hasMore = compactLimit !== undefined && allRecords.length > compactLimit;
  const filtered = compactLimit ? allRecords.slice(0, compactLimit) : allRecords;
  if (filtered.length === 0 && !config.composition) return null;

  const routeBase = config.routeBase.replace("{workspaceId}", workspaceId);
  const displayField = getDisplayField(relatedDetail?.fields ?? [], config.titleField);
  const permissions = new Set(workspaceAccess?.accessSummary?.permissions ?? []);
  const createPermission = config.objectKey === "quote_line" ? "quote.edit_draft" : `${config.objectKey}.create`;
  const canCreate = workspaceAccess?.workspaceRole === "admin"
    || permissions.has("*")
    || permissions.has(createPermission);

  if (config.composition) {
    const returnTo = `/w/${workspaceId}/${objectKeyToRouteSegment(parentObjectKey)}/${recordId}`;
    const createHref = `${routeBase}/new?parentField=${encodeURIComponent(config.foreignKey)}&parentId=${encodeURIComponent(recordId)}&returnTo=${encodeURIComponent(returnTo)}`;
    return (
      <section className="app-card overflow-hidden p-0">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{config.label}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("workspace.recordCount", { count: filtered.length })}</p>
          </div>
          {config.composition.allowCreate && canCreate && (
            <Link href={createHref} className="app-button-secondary self-start">
              <Plus size={15} />{t("workspace.addRecord")}
            </Link>
          )}
        </div>
        <SchemaTable
          fields={relatedDetail?.fields ?? []}
          viewConfig={{ columns: config.composition.columns }}
          records={filtered}
          workspaceId={workspaceId}
          objectKey={config.objectKey}
          basePath={routeBase}
          embedded
        />
      </section>
    );
  }

  if (config.backlinkPresentation?.mode === "compact") {
    const viewAllHref = `${routeBase}?filter.${encodeURIComponent(config.foreignKey)}=${encodeURIComponent(recordId)}`;
    return (
      <section className="app-card overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{config.label}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {t("workspace.recordCount", { count: hasMore ? `${filtered.length}+` : filtered.length })}
            </p>
          </div>
          {hasMore && (
            <Link href={viewAllHref} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
              {t("widget.viewAll")} →
            </Link>
          )}
        </div>
        <SchemaTable
          fields={relatedDetail?.fields ?? []}
          viewConfig={{ columns: config.backlinkPresentation.columns ?? [] }}
          records={filtered}
          workspaceId={workspaceId}
          objectKey={config.objectKey}
          basePath={routeBase}
          embedded
        />
      </section>
    );
  }

  return (
    <div className="app-card p-5 sm:p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {config.label}（{filtered.length}）
      </p>
      <ul className="mt-2 space-y-1">
        {filtered.map((r) => (
          <li key={String(r.id)}>
            <Link
              href={`${routeBase}/${r.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              {String(r[displayField] ?? t("workspace.recordNotFound"))}
            </Link>
            {config.secondaryFields?.map((sf) =>
              r[sf] ? (
                <span key={sf} className="ml-2 text-xs text-slate-500">
                  {String(r[sf])}
                </span>
              ) : null
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface VisitRequirement {
  id: string;
  label: string;
  form_name: string;
  form_key: string;
  form_version_id: string;
  requirement_policy: string;
  work_item_id: string | null;
  work_item_status: string | null;
  submission_id: string | null;
  submission_status: string | null;
  submission_revision: number | null;
  submitted_at: string | null;
  post_submission_policy: "editable_after_submission" | "reason_required" | "approval_required";
}

interface FormDefinitionDetail {
  definition: {
    id: string;
    name: string;
    version_number: number;
  };
  schema: { blocks: FormBlock[] };
}

interface FormSubmissionDetail {
  id: string;
  status: string;
  answers_json: string;
  submitted_at: string | null;
  accepted_at: string | null;
}

interface WorkOrderDeliverableRequirement {
  id: string;
  label: string;
  policy: string;
  formKey: string | null;
  formName: string | null;
  workItemId: string | null;
  workItemStatus: string | null;
  submissionId: string | null;
  submissionStatus: string | null;
  submissionRevision: number | null;
}

function requirementStatusLabel(
  workItemStatus: string | null,
  submissionStatus: string | null
): { label: string; className: string; complete: boolean } {
  if (submissionStatus === "draft") {
    return { label: "Revision draft", className: "bg-amber-50 text-amber-700", complete: false };
  }
  if (submissionStatus === "returned") {
    return { label: "Returned", className: "bg-rose-50 text-rose-700", complete: false };
  }
  if (workItemStatus === "completed") {
    return { label: "Completed", className: "bg-emerald-50 text-emerald-700", complete: true };
  }
  if (submissionStatus === "accepted") {
    return { label: "Accepted", className: "bg-emerald-50 text-emerald-700", complete: false };
  }
  if (submissionStatus === "submitted") {
    return { label: "Submitted", className: "bg-blue-50 text-blue-700", complete: false };
  }
  return { label: "Required", className: "bg-slate-100 text-slate-600", complete: false };
}

function parseSubmissionAnswers(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function humanizeFormValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).replaceAll("_", " ");
  }
  return "Captured";
}

function checklistResult(value: unknown): { result: string | null; notes: string | null } {
  if (typeof value === "string") return { result: value, notes: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { result: null, notes: null };
  }
  const answer = value as Record<string, unknown>;
  return {
    result: typeof answer.result === "string" ? answer.result : null,
    notes: typeof answer.notes === "string" && answer.notes.trim() ? answer.notes : null,
  };
}

function VisitFormBlockResult({
  block,
  answers,
}: {
  block: FormBlock;
  answers: Record<string, unknown>;
}) {
  if (block.block_type === "header") {
    return (
      <div className="border-b border-slate-200 pb-2 pt-2 first:pt-0">
        <h5 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          {block.label}
        </h5>
      </div>
    );
  }

  if (block.block_type === "checklist") {
    const blockAnswer = answers[block.id];
    const itemAnswers = blockAnswer && typeof blockAnswer === "object" && !Array.isArray(blockAnswer)
      ? (blockAnswer as Record<string, unknown>)
      : {};
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h5 className="text-sm font-semibold text-slate-900">{block.label}</h5>
          <span className="text-xs font-medium text-slate-500">Checklist</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {(block.items ?? []).map((item) => {
            const answer = checklistResult(itemAnswers[item.id]);
            const passed = answer.result === "pass";
            const failed = answer.result === "fail";
            const notApplicable = answer.result === "na";
            return (
              <li key={item.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
                    passed
                      ? "bg-emerald-100 text-emerald-700"
                      : failed
                        ? "bg-rose-100 text-rose-700"
                        : notApplicable
                          ? "bg-slate-100 text-slate-500"
                          : "border border-slate-200 text-slate-400"
                  }`}
                >
                  {passed ? <Check size={14} /> : failed ? <XCircle size={14} /> : <Minus size={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-800">{item.label}</span>
                  {answer.notes && <span className="mt-0.5 block text-xs text-slate-500">{answer.notes}</span>}
                </span>
                <span className={`text-xs font-semibold ${failed ? "text-rose-600" : passed ? "text-emerald-700" : "text-slate-500"}`}>
                  {passed ? "Pass" : failed ? "Fail" : notApplicable ? "N/A" : "Pending"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (block.block_type === "evidence") {
    const value = answers[block.id];
    const attachments = value && typeof value === "object" && !Array.isArray(value)
      ? (value as { attachments?: unknown }).attachments
      : undefined;
    const count = Array.isArray(attachments) ? attachments.length : 0;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
            <Camera size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">{block.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {count > 0 ? `${count} file${count === 1 ? "" : "s"} captured` : "No evidence captured"}
              {block.required_count ? ` · ${block.required_count} required` : ""}
            </span>
          </span>
          {count > 0 && <CheckCircle2 size={18} className="text-emerald-600" />}
        </div>
      </div>
    );
  }

  if (block.block_type === "signature") {
    const value = answers[block.id];
    const signature = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
    const signer = typeof signature.signerLabel === "string"
      ? signature.signerLabel
      : typeof signature.signedBy === "string"
        ? signature.signedBy
        : null;
    const signedAt = typeof signature.timestamp === "string"
      ? signature.timestamp
      : typeof signature.signed_at === "string"
        ? signature.signed_at
        : null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
            <PenLine size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">{block.label}</span>
            {block.acknowledgment_text && (
              <span className="mt-1 block text-xs leading-5 text-slate-500">{block.acknowledgment_text}</span>
            )}
            <span className={`mt-2 block text-sm font-medium ${signer ? "text-slate-800" : "text-slate-400"}`}>
              {signer ? `Signed by ${signer}` : "Signature pending"}
            </span>
            {signedAt && <span className="mt-0.5 block text-xs text-slate-500">{formatMetaDate(signedAt, "en")}</span>}
          </span>
          {signature.acknowledged === true && <CheckCircle2 size={18} className="mt-0.5 text-emerald-600" />}
        </div>
      </div>
    );
  }

  const answerKey = block.field_key ?? block.id;
  const value = answers[answerKey];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {block.label}{block.required ? " *" : ""}
      </dt>
      <dd className={`mt-1.5 whitespace-pre-wrap text-sm leading-6 ${value === null || value === undefined || value === "" ? "text-slate-400" : "text-slate-800"}`}>
        {humanizeFormValue(value)}
      </dd>
    </div>
  );
}

function VisitRequirementDetails({
  workspaceId,
  requirement,
}: {
  workspaceId: string;
  requirement: VisitRequirement;
}) {
  const definitionUrl = requirement.form_key && requirement.form_version_id
    ? `/api/workspaces/${workspaceId}/forms/definitions/${encodeURIComponent(requirement.form_key)}?versionId=${encodeURIComponent(requirement.form_version_id)}`
    : null;
  const { data: form, isLoading: formLoading, error: formError } = useSWR<FormDefinitionDetail>(definitionUrl);
  const submissionUrl = requirement.submission_id
    ? `/api/workspaces/${workspaceId}/forms/submissions/${requirement.submission_id}`
    : null;
  const { data: submission, isLoading: submissionLoading, error: submissionError } = useSWR<FormSubmissionDetail>(submissionUrl);
  const answers = useMemo(() => parseSubmissionAnswers(submission?.answers_json), [submission?.answers_json]);
  const status = requirementStatusLabel(requirement.work_item_status, requirement.submission_status);
  const router = useRouter();
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [startingRevision, setStartingRevision] = useState(false);
  const canExecute = Boolean(requirement.work_item_id)
    && !status.complete
    && requirement.submission_status !== "submitted"
    && requirement.submission_status !== "accepted";
  const canRevise = Boolean(requirement.submission_id && requirement.work_item_id)
    && (requirement.submission_status === "submitted" || requirement.submission_status === "accepted");

  const startRevision = async () => {
    if (!requirement.submission_id || !requirement.work_item_id) return;
    if (requirement.post_submission_policy === "reason_required" && !revisionReason.trim()) {
      setRevisionError("Enter a reason for this correction.");
      return;
    }
    try {
      setStartingRevision(true);
      setRevisionError(null);
      const response = await apiPost<{
        success: boolean;
        error?: { message?: string };
      }>(
        `/api/workspaces/${workspaceId}/forms/submissions/${requirement.submission_id}/revise`,
        { reason: revisionReason.trim() || undefined }
      );
      if (!response.success) throw new Error(response.error?.message ?? "Revision could not be started");
      router.push(`/m/w/${workspaceId}/work/${requirement.work_item_id}/form`);
    } catch (error) {
      setRevisionError(error instanceof Error ? error.message : "Revision could not be started");
    } finally {
      setStartingRevision(false);
    }
  };

  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${status.complete ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"}`}>
            {status.complete ? <CheckCircle2 size={18} /> : <ClipboardList size={17} />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900">{requirement.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {requirement.form_name} · Version {form?.definition.version_number ?? "—"}
              {requirement.submission_revision ? ` · Revision ${requirement.submission_revision}` : ""}
            </span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
          <span className={`app-badge ${status.className}`}>{status.label}</span>
          {canExecute && requirement.work_item_id && (
            <Link
              href={`/m/w/${workspaceId}/work/${requirement.work_item_id}/form`}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {submission ? "Continue" : "Start"} →
            </Link>
          )}
          {canRevise && (
            <button
              type="button"
              onClick={() => {
                if (requirement.post_submission_policy === "editable_after_submission") {
                  void startRevision();
                } else {
                  setRevisionOpen(true);
                }
              }}
              disabled={startingRevision}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              {startingRevision ? "Starting…" : "Edit submitted form"}
            </button>
          )}
        </div>
      </div>

      {revisionOpen && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h5 className="text-sm font-bold text-slate-900">Create a new revision</h5>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Revision {requirement.submission_revision ?? 1} remains unchanged. Its answers will be copied into an editable revision.
                {requirement.post_submission_policy === "approval_required"
                  ? " The revised submission will require reviewer approval."
                  : " The correction reason is retained in the audit history."}
              </p>
            </div>
            <button type="button" onClick={() => setRevisionOpen(false)} className="text-slate-400 hover:text-slate-600">
              <XCircle size={17} />
            </button>
          </div>
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            Correction reason{requirement.post_submission_policy === "reason_required" ? " *" : ""}
          </label>
          <textarea
            value={revisionReason}
            onChange={(event) => {
              setRevisionReason(event.target.value);
              setRevisionError(null);
            }}
            placeholder="Describe why the submitted field record needs to change"
            className="app-input mt-1 min-h-20 resize-y text-sm"
          />
          {revisionError && <p className="mt-2 text-xs font-medium text-rose-600">{revisionError}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setRevisionOpen(false)} className="app-button-secondary">
              Cancel
            </button>
            <button type="button" onClick={() => void startRevision()} disabled={startingRevision} className="app-button-primary">
              {startingRevision ? <Loader2 size={15} className="animate-spin" /> : <Pencil size={15} />}
              Create revision
            </button>
          </div>
        </div>
      )}

      {formLoading || submissionLoading ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading field service form…
        </div>
      ) : formError || submissionError || !form ? (
        <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          The field service form could not be loaded.
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
          {!submission && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This form is required and has not been submitted. The dispatched checklist is shown below.
            </div>
          )}
          <div className="space-y-3">
            {form.schema.blocks.map((block) => (
              <VisitFormBlockResult key={block.id} block={block} answers={answers} />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

function ServiceVisitRequiredWorkPanel({
  workspaceId,
  visitId,
}: {
  workspaceId: string;
  visitId: string;
}) {
  const { data, isLoading, error } = useSWR<{ requirements: VisitRequirement[] }>(
    `/api/workspaces/${workspaceId}/service-visits/${visitId}/execution`
  );
  const { data: workspaceAccess } = useWorkspaceAccess(workspaceId);
  if (isLoading) return null;
  const requirements = data?.requirements ?? [];
  const completed = requirements.filter(
    (requirement) => requirement.work_item_status === "completed" && requirement.submission_status !== "draft"
  ).length;

  return (
    <section className="app-card overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList size={17} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Field service work</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            The dispatched form, checklist results, evidence, and customer sign-off for this Visit.
          </p>
        </div>
        {requirements.length > 0 && (
          <span className="self-start rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {completed} / {requirements.length} completed
          </span>
        )}
      </div>

      {error ? (
        <p className="px-5 py-4 text-sm text-rose-600">Required work could not be loaded.</p>
      ) : requirements.length === 0 ? (
        <div className="px-5 py-5 sm:px-6">
          <p className="text-sm font-semibold text-slate-800">No required forms were captured for this Visit.</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Legacy or manually created Visits may not have a dispatch-time requirement snapshot.
          </p>
          {workspaceAccess?.workspaceRole === "admin" && (
            <Link href={`/w/${workspaceId}/forms`} className="mt-3 inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-800">
              Manage forms &amp; usage policies →
            </Link>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {requirements.map((requirement) => (
            <VisitRequirementDetails
              key={requirement.id}
              workspaceId={workspaceId}
              requirement={requirement}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkOrderDeliverablesPanel({
  workspaceId,
  workOrderId,
}: {
  workspaceId: string;
  workOrderId: string;
}) {
  const { data, isLoading, error } = useSWR<{
    summary: { total: number; completed: number };
    visits: Array<{
      id: string;
      title: string;
      status: string;
      scheduledStart: string | null;
      scheduledEnd: string | null;
      technicianName: string | null;
      requirements: WorkOrderDeliverableRequirement[];
    }>;
  }>(`/api/workspaces/${workspaceId}/work-orders/${workOrderId}/deliverables`);
  const { data: workspaceAccess } = useWorkspaceAccess(workspaceId);
  if (isLoading || (!error && (data?.visits.length ?? 0) === 0)) return null;

  return (
    <section className="app-card overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList size={17} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Service deliverables</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">Required forms roll up from each Service Visit.</p>
        </div>
        {data && data.summary.total > 0 && (
          <span className="self-start rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {data.summary.completed} / {data.summary.total} completed
          </span>
        )}
      </div>

      {error ? (
        <p className="px-5 py-4 text-sm text-rose-600">Service deliverables could not be loaded.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {data?.visits.map((visit) => (
            <div key={visit.id} className="px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/w/${workspaceId}/service-visits/${visit.id}`} className="text-sm font-bold text-slate-900 hover:text-indigo-700">
                  {visit.title}
                </Link>
                <span className="text-xs text-slate-500">
                  {[visit.technicianName, visit.scheduledStart ? new Date(visit.scheduledStart).toLocaleDateString() : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {visit.requirements.length === 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-800">No dispatch-time form requirements were captured.</p>
                  {workspaceAccess?.workspaceRole === "admin" && (
                    <Link href={`/w/${workspaceId}/forms`} className="mt-1 inline-flex text-xs font-semibold text-amber-900 underline">
                      Review usage policies
                    </Link>
                  )}
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {visit.requirements.map((requirement) => {
                    const status = requirementStatusLabel(requirement.workItemStatus, requirement.submissionStatus);
                    return (
                      <li key={requirement.id} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 size={15} className={status.complete ? "text-emerald-600" : "text-slate-300"} />
                        <span className="min-w-0 flex-1 truncate text-slate-700">{requirement.label}</span>
                        <span className={`app-badge shrink-0 ${status.className}`}>{status.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface BusinessCommandAction {
  command: string;
  label: string;
  tone?: "primary" | "secondary" | "danger";
  reasonPrompt?: string;
  body?: Record<string, unknown>;
}

function getBusinessCommandActions(objectKey: string, record: WorkspaceRecord): BusinessCommandAction[] {
  const status = String(record.status ?? "");
  if (objectKey === "work_order") {
    const actions: BusinessCommandAction[] = [];
    if (status === "new") {
      actions.push({ command: "work_order.triage", label: "Triage", tone: "primary" });
    }
    if (status === "triaged") {
      actions.push({ command: "work_order.create_visit", label: "Plan & dispatch", tone: "primary" });
    }
    if (status === "planned" || status === "reopened") {
      actions.push({ command: "work_order.start", label: "Start work", tone: "primary" });
    }
    if (status === "planned" || status === "in_progress") {
      actions.push({ command: "work_order.create_visit", label: "Add visit", tone: "secondary" });
    }
    if (status === "blocked") {
      actions.push({ command: "work_order.unblock", label: "Unblock", tone: "secondary" });
    }
    if (status === "in_progress") {
      actions.push({ command: "work_order.complete", label: "Complete", tone: "primary" });
    }
    if (!["completed", "cancelled", "blocked"].includes(status)) {
      actions.push({ command: "work_order.block", label: "Block", tone: "secondary", reasonPrompt: "Reason for blocking this work order?" });
      actions.push({ command: "work_order.cancel", label: "Cancel", tone: "danger", reasonPrompt: "Reason for cancelling this work order?" });
    }
    if (status === "completed" || status === "cancelled") {
      actions.push({ command: "work_order.reopen", label: "Reopen", tone: "secondary", reasonPrompt: "Reason for reopening this work order?" });
    }
    return actions;
  }

  if (objectKey === "service_visit") {
    const actions: BusinessCommandAction[] = [];
    if (status === "scheduled") {
      actions.push({ command: "visit.start_travel", label: "Start travel", tone: "primary" });
    }
    if (status === "en_route") {
      actions.push({ command: "visit.arrive", label: "Arrive on site", tone: "primary" });
    }
    if (status === "on_site") {
      actions.push({ command: "visit.submit_work", label: "Submit work", tone: "secondary" });
      actions.push({ command: "visit.complete", label: "Complete visit", tone: "primary" });
    }
    if (!["completed", "cancelled"].includes(status)) {
      actions.push({ command: "visit.cancel", label: "Cancel visit", tone: "danger", reasonPrompt: "Reason for cancelling this visit?" });
    }
    return actions;
  }

  return [];
}

function buttonClassForTone(tone: BusinessCommandAction["tone"]): string {
  if (tone === "danger") return "app-button-danger";
  if (tone === "primary") return "app-button-primary";
  return "app-button-secondary";
}

function iconForBusinessCommand(command: string): typeof Play {
  switch (command) {
    case "work_order.complete":
    case "visit.complete":
      return CheckCircle2;
    case "work_order.block":
      return Ban;
    case "work_order.cancel":
    case "visit.cancel":
      return XCircle;
    case "work_order.reopen":
    case "work_order.unblock":
      return RotateCcw;
    case "work_order.triage":
      return ClipboardList;
    case "work_order.create_visit":
      return Calendar;
    case "visit.start_travel":
      return Navigation;
    case "visit.arrive":
      return MapPin;
    case "visit.submit_work":
      return Send;
    case "work_order.start":
    default:
      return Play;
  }
}

export default function ObjectDetailPage({
  objectKey,
  viewKey,
  basePath,
  title,
  singularLabel,
  backLabel,
  parentLinks: manualParentLinks = [],
  related: manualRelated = [],
}: ObjectDetailPageProps) {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const recordId = params.id as string;
  const { t, locale } = useI18n();

  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, objectKey);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, objectKey);
  const { data: record, error: recordError, isLoading: loadingRecord, mutate: mutateRecord } = useRecord(workspaceId, objectKey, recordId);
  const { data: relationsData } = useRelations(workspaceId, objectKey);
  const { data: technicians = [] } = useRecords(workspaceId, "technician", { sortBy: "name", sortOrder: "asc" });

  useWorkspaceChangeEvent(workspaceId);

  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchTechnicianId, setDispatchTechnicianId] = useState("");
  const [dispatchStart, setDispatchStart] = useState("");
  const [dispatchEnd, setDispatchEnd] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");

  const loading = loadingObj || loadingViews || loadingRecord;
  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === viewKey)?.config ?? null;
  const label = singularLabel ?? title;
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.fieldKey, f])), [fields]);
  const viewSections = (viewConfig?.sections as Array<{ title: string; fields: Array<{ field: string; required?: boolean }> }> | undefined) ?? [];
  const readOnlyFields = useMemo(
    () => Object.fromEntries(
      (GOVERNED_FIELD_KEYS[objectKey] ?? []).map((fieldKey) => [
        fieldKey,
        "Managed by lifecycle actions. Use the record's business actions to change this value.",
      ])
    ),
    [objectKey]
  );

  // Derive parentLinks and related from relation metadata (v0.3.2).
  // Manual props take precedence; metadata fills in the rest.
  const metadataRelations = relationsData?.relations ?? [];
  const metadataBacklinks = relationsData?.backlinks ?? [];

  const parentLinks = useMemo(() => {
    const manualKeys = new Set(manualParentLinks.map((p) => p.foreignKey));
    const derived: ParentLinkConfig[] = metadataRelations
      .filter((r) => r.relationType === "many_to_one" && !manualKeys.has(r.foreignKey))
      .map((r) => ({
        foreignKey: r.foreignKey,
        parentObjectKey: r.targetObjectKey,
        label: r.label ?? t("workspace.relatedRecords", { target: r.targetObjectKey }),
        routeBase: `/w/{workspaceId}/${objectKeyToRouteSegment(r.targetObjectKey)}`,
      }));
    return [...manualParentLinks, ...derived];
  }, [manualParentLinks, metadataRelations]);

  const related = useMemo(() => {
    const manualKeys = new Set(manualRelated.map((r) => r.objectKey));
    const derived: RelatedRecordsConfig[] = metadataBacklinks
      // Database backlinks are not automatically product UI. A module must
      // explicitly opt in with composition or a presentation policy.
      .filter((r) => (
        !manualKeys.has(r.objectKey)
        && (Boolean(r.composition) || r.backlinkPresentation?.mode === "compact")
      ))
      .map((r) => ({
        objectKey: r.objectKey,
        foreignKey: r.foreignKey,
        // Use the child object's localized name, not the relation's label
        // (which is the child→parent perspective, e.g. "Related Company").
        label: t("workspace.relatedRecords", { target: getObjectLabel(r.objectKey, t) }),
        routeBase: `/w/{workspaceId}/${objectKeyToRouteSegment(r.objectKey)}`,
        composition: r.composition,
        backlinkPresentation: r.backlinkPresentation,
      }));
    return [...manualRelated, ...derived];
  }, [manualRelated, metadataBacklinks, t]);

  // Build a set of FK field keys to skip in the main <dl> — these are already
  // shown as proper links in the ParentLinkPanel below, so showing raw IDs in
  // the info section is redundant and confusing.
  const fkFieldKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const link of parentLinks) {
      keys.add(link.foreignKey);
    }
    return keys;
  }, [parentLinks]);

  const handleUpdate = async (data: Record<string, any>) => {
    setSubmitting(true);
    setError(null);
    try {
      const json = await apiFetch<{ success: boolean; error?: { message: string }; data: WorkspaceRecord }>(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(data),
        }
      );
      if (json.success) {
        await mutateRecord(json.data);
        notifyWorkspaceDataChanged();
        setEditing(false);
      } else {
        setError(json.error?.message ?? t("workspace.updateFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.updateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("workspace.deleteConfirm", { label }))) return;
    setDeleting(true);
    setError(null);
    try {
      const json = await apiDelete<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`
      );
      if (json.success) {
        notifyWorkspaceDataChanged();
        router.push(basePath);
        router.refresh();
      } else {
        setError(json.error?.message ?? t("workspace.deleteFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const executeBusinessCommand = async (action: BusinessCommandAction) => {
    if (!record) return;
    if (action.command === "work_order.create_visit" && !dispatchOpen) {
      setDispatchOpen(true);
      return;
    }
    const reason = action.reasonPrompt ? window.prompt(action.reasonPrompt) : undefined;
    if (action.reasonPrompt && !reason) return;

    setRunningCommand(action.command);
    setError(null);
    try {
      const json = await apiFetch<{ success: boolean; error?: { message: string } }>(
        `/api/workspaces/${workspaceId}/commands/${action.command}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Idempotency-Key": `${action.command}:${recordId}:${Date.now()}`,
          },
          body: JSON.stringify({
            aggregateId: recordId,
            expectedVersion: Number(record.aggregate_version ?? 1),
            reason,
            completionReason: reason,
            ...(action.body ?? {}),
            ...(action.command === "work_order.create_visit" ? {
              technicianId: dispatchTechnicianId,
              scheduledStart: dispatchStart ? new Date(dispatchStart).toISOString() : undefined,
              scheduledEnd: dispatchEnd ? new Date(dispatchEnd).toISOString() : undefined,
              notes: dispatchNotes || undefined,
            } : {}),
          }),
        }
      );
      if (!json.success) {
        setError(json.error?.message ?? "Command failed");
        return;
      }
      await mutateRecord();
      notifyWorkspaceDataChanged();
      if (action.command === "work_order.create_visit") {
        setDispatchOpen(false);
        setDispatchNotes("");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Command failed");
    } finally {
      setRunningCommand(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="app-skeleton h-8 w-48" />
        <div className="app-card space-y-4 p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="app-skeleton h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="space-y-4">
        {(error || recordError) && (
          <div className="app-error">
            {error ?? (recordError instanceof Error ? recordError.message : t("workspace.recordNotFound"))}
          </div>
        )}
        <Link
          href={basePath}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft size={14} />{backLabel ?? t("workspace.backToList", { title })}
        </Link>
      </div>
    );
  }

  const renderFieldRow = (field: FieldDefinition) => {
    const value = record[field.fieldKey];
    const resolvedDisplayValue = record[`${field.fieldKey}_display`];
    const isExtension = field.ownership === "workspace_extension";
    const isDateType = field.type === "date" || field.type === "datetime";
    let displayValue: React.ReactNode;
    if (field.type === "boolean") {
      displayValue = value ? t("workspace.yes") : t("workspace.no");
    } else if (value === null || value === undefined || value === "") {
      displayValue = "—";
    } else if (field.type === "user" && resolvedDisplayValue) {
      displayValue = String(resolvedDisplayValue);
    } else if (isDateType) {
      try {
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) {
          displayValue = String(value);
        } else if (field.type === "datetime") {
          displayValue = date.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          displayValue = date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        }
      } catch {
        displayValue = String(value);
      }
    } else {
      displayValue = String(value);
    }
    return (
      <div key={field.id}>
        <dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
          {field.label}
          {isExtension && (
            <span className="rounded bg-purple-100 px-1 text-[10px] font-medium text-purple-700">
              {t("workspace.extension")}
            </span>
          )}
        </dt>
        <dd className="mt-1 text-sm text-slate-900">{displayValue}</dd>
      </div>
    );
  };

  const businessActions = getBusinessCommandActions(objectKey, record);
  const identityAvatarUrl = typeof record.user_id_avatar_url === "string"
    ? record.user_id_avatar_url
    : null;
  const identityName = typeof record.name === "string" ? record.name : title;

  return (
    <div className="space-y-6 page-enter">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {identityAvatarUrl && (
            <UserAvatar
              name={identityName}
              avatarUrl={identityAvatarUrl}
              size="xl"
              presence={record.availability_status === "available" ? "online" : record.availability_status === "busy" ? "busy" : "offline"}
            />
          )}
          <div>
          <Link
            href={basePath}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft size={14} />{backLabel ?? t("workspace.backToList", { title })}
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">
            {t("workspace.detailTitle", { title })}
          </h1>
          {identityAvatarUrl && <p className="mt-1 text-sm font-medium text-slate-500">{identityName}</p>}
          </div>
        </div>
        {!editing && (
          <div className="flex gap-2 self-start">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="app-button-secondary"
            >
              <Pencil size={15} />{t("workspace.edit")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="app-button-danger"
            >
              <Trash2 size={15} />{deleting ? t("workspace.deleting") : t("workspace.delete")}
            </button>
          </div>
        )}
      </header>

      {error && <div className="app-error">{error}</div>}

      {editing && viewConfig ? (
        <SchemaForm
          fields={fields}
          viewConfig={viewConfig}
          initialValues={record}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
          submitLabel={submitting ? t("workspace.saving") : t("workspace.save")}
          workspaceId={workspaceId}
          readOnlyFields={readOnlyFields}
        />
      ) : (
        <div className="space-y-6">
          {businessActions.length > 0 && (
            <div className="app-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business actions</p>
                <p className="mt-1 text-sm text-slate-600">Advance this record through governed commands.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {businessActions.map((action) => {
                  const ActionIcon = iconForBusinessCommand(action.command);
                  return (
                    <button
                      key={action.command}
                      type="button"
                      onClick={() => void executeBusinessCommand(action)}
                      disabled={runningCommand !== null}
                      className={buttonClassForTone(action.tone)}
                    >
                      {runningCommand === action.command ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <ActionIcon size={15} />
                      )}
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {dispatchOpen && objectKey === "work_order" && (
            <section className="app-card p-5 sm:p-6" aria-labelledby="plan-dispatch-title">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 id="plan-dispatch-title" className="text-base font-bold text-slate-900">Plan &amp; dispatch</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Creates the visit, assignment, confirmed appointment, execution work, and required evidence together.
                  </p>
                </div>
                <button type="button" onClick={() => setDispatchOpen(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-800">
                  Cancel
                </button>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Technician
                  <select
                    value={dispatchTechnicianId}
                    onChange={(event) => setDispatchTechnicianId(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    required
                  >
                    <option value="">Select a technician</option>
                    {technicians.map((technician) => (
                      <option key={String(technician.id)} value={String(technician.id)}>
                        {String(technician.name ?? technician.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Scheduled start
                  <input
                    type="datetime-local"
                    value={dispatchStart}
                    onChange={(event) => setDispatchStart(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    required
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Scheduled end
                  <input
                    type="datetime-local"
                    value={dispatchEnd}
                    onChange={(event) => setDispatchEnd(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    required
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Dispatch notes <span className="font-normal text-slate-400">(optional)</span>
                  <input
                    value={dispatchNotes}
                    onChange={(event) => setDispatchNotes(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  disabled={!dispatchTechnicianId || !dispatchStart || !dispatchEnd || runningCommand !== null}
                  onClick={() => void executeBusinessCommand({ command: "work_order.create_visit", label: "Plan & dispatch", tone: "primary" })}
                  className="app-button-primary"
                >
                  {runningCommand === "work_order.create_visit" ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />}
                  Dispatch visit
                </button>
              </div>
            </section>
          )}

          {/* Field sections (grouped cards) */}
          {viewSections.length > 0 ? (
            viewSections.map((section, si) => {
              const sectionFields = section.fields
                .map((sf) => fieldMap.get(sf.field))
                .filter((f): f is FieldDefinition => (
                  Boolean(f)
                  && !fkFieldKeys.has(f!.fieldKey)
                  && !CANONICAL_DETAIL_HIDDEN_FIELDS[objectKey]?.has(f!.fieldKey)
                ));
              if (sectionFields.length === 0) return null;
              return (
                <div key={si} className="app-card p-5 sm:p-6">
                  <h3 className="mb-4 text-sm font-bold text-slate-900">{section.title}</h3>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    {sectionFields.map(renderFieldRow)}
                  </dl>
                </div>
              );
            })
          ) : (
            <div className="app-card p-5 sm:p-6">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                {fields.filter((field) => !fkFieldKeys.has(field.fieldKey)).map(renderFieldRow)}
              </dl>
            </div>
          )}

          {/* Workflow panel: fetches its own workflow data */}
          <RecordWorkflowPanel
            workspaceId={workspaceId}
            objectKey={objectKey}
            recordId={recordId}
          />

          {/* Parent associations */}
          {parentLinks.length > 0 && (
            <div className="app-card p-5 sm:p-6">
              {parentLinks.map((cfg) => (
                <ParentLinkPanel
                  key={cfg.foreignKey}
                  workspaceId={workspaceId}
                  record={record}
                  config={cfg}
                />
              ))}
            </div>
          )}

          {/* FSM execution requirements are first-class business context.
              A Visit owns the immutable requirement snapshot; its Work Order
              receives an aggregate, read-only roll-up across all Visits. */}
          {objectKey === "service_visit" && (
            <ServiceVisitRequiredWorkPanel workspaceId={workspaceId} visitId={recordId} />
          )}
          {objectKey === "work_order" && (
            <WorkOrderDeliverablesPanel workspaceId={workspaceId} workOrderId={recordId} />
          )}

          {/* Related collections, including composition-style child tables. */}
          {related.map((cfg) => (
            <RelatedRecordsPanel
              key={`${cfg.objectKey}:${cfg.foreignKey}`}
              workspaceId={workspaceId}
              parentObjectKey={objectKey}
              recordId={recordId}
              config={cfg}
            />
          ))}

          {/* Activity Timeline (v0.5.1) */}
          {isValidTimelineSubject(objectKey) && (
            <RecordTimelineSection
              workspaceId={workspaceId}
              subjectType={objectKey}
              subjectId={recordId}
            />
          )}

          {/* Meta */}
          <div className="text-xs text-slate-400">
            <p>{t("workspace.createdAt", { time: formatMetaDate(record.created_at, locale) })}</p>
            <p>{t("workspace.updatedAt", { time: formatMetaDate(record.updated_at, locale) })}</p>
          </div>
        </div>
      )}
    </div>
  );
}
