"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import useSWR from "swr";
import SchemaForm from "./SchemaForm";
import RecordWorkflowPanel from "./RecordWorkflowPanel";
import RecordTimelineSection, { isValidTimelineSubject } from "./RecordTimelineSection";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useFields,
  useViews,
  useRecord,
  useRecords,
  useRelations,
  useWorkspaceChangeEvent,
  type WorkspaceRecord,
} from "@/lib/api-hooks";
import { notifyWorkspaceDataChanged } from "@/lib/workspace-events";
import { useI18n } from "@/i18n/locale-provider";
import type { Locale } from "@/i18n/config";
import { objectKeyToRouteSegment } from "@/lib/dynamic-object";
import type { MessageKey } from "@/i18n/messages";
import { apiFetch, apiDelete } from "@/lib/api-fetch";

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
  "service-site": "workspace.nav.objectServiceSite",
  technician: "workspace.nav.objectTechnician",
  "service-report": "workspace.nav.objectServiceReport",
  "service-visit": "workspace.nav.objectServiceVisit",
  campaign: "workspace.nav.objectCampaign",
  "landing-page": "workspace.nav.objectLandingPage",
  form: "workspace.nav.objectForm",
  submission: "workspace.nav.objectSubmission",
  ticket: "workspace.nav.objectTicket",
  conversation: "workspace.nav.objectConversation",
  knowledge: "workspace.nav.objectKnowledge",
  "product-service": "workspace.nav.objectProductService",
  "price-book": "workspace.nav.objectPriceBook",
  quote: "workspace.nav.objectQuote",
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
  recordId,
  config,
}: {
  workspaceId: string;
  recordId: string;
  config: RelatedRecordsConfig;
}) {
  const { t } = useI18n();
  const { data: relatedDetail } = useFields(workspaceId, config.objectKey);
  const { data: allRecords = [] } = useRecords(workspaceId, config.objectKey, {
    search: recordId,
  });
  const filtered = allRecords.filter(
    (r) => String(r[config.foreignKey]) === String(recordId)
  );
  if (filtered.length === 0) return null;

  const routeBase = config.routeBase.replace("{workspaceId}", workspaceId);
  const displayField = getDisplayField(relatedDetail?.fields ?? [], config.titleField);
  return (
    <div>
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
    if (status === "planned" || status === "reopened") {
      actions.push({ command: "work_order.start", label: "Start work", tone: "primary" });
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

  useWorkspaceChangeEvent(workspaceId);

  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      .filter((r) => !manualKeys.has(r.objectKey))
      .map((r) => ({
        objectKey: r.objectKey,
        foreignKey: r.foreignKey,
        // Use the child object's localized name, not the relation's label
        // (which is the child→parent perspective, e.g. "Related Company").
        label: t("workspace.relatedRecords", { target: getObjectLabel(r.objectKey, t) }),
        routeBase: `/w/{workspaceId}/${objectKeyToRouteSegment(r.objectKey)}`,
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
          }),
        }
      );
      if (!json.success) {
        setError(json.error?.message ?? "Command failed");
        return;
      }
      await mutateRecord();
      notifyWorkspaceDataChanged();
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

  return (
    <div className="space-y-6 page-enter">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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

          {/* Field sections (grouped cards) */}
          {viewSections.length > 0 ? (
            viewSections.map((section, si) => {
              const sectionFields = section.fields
                .map((sf) => fieldMap.get(sf.field))
                .filter((f): f is FieldDefinition => !!f && !fkFieldKeys.has(f.fieldKey));
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

          {/* Parent + related associations */}
          {(parentLinks.length > 0 || related.length > 0) && (
            <div className="app-card p-5 sm:p-6">
              {parentLinks.map((cfg) => (
                <ParentLinkPanel
                  key={cfg.foreignKey}
                  workspaceId={workspaceId}
                  record={record}
                  config={cfg}
                />
              ))}
              {related.length > 0 && (
                <div className="mt-6 space-y-4 border-t border-slate-100 pt-4">
                  {related.map((cfg) => (
                    <RelatedRecordsPanel
                      key={cfg.objectKey}
                      workspaceId={workspaceId}
                      recordId={recordId}
                      config={cfg}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

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
