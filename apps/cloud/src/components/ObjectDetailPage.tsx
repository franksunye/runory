"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import SchemaForm from "./SchemaForm";
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
import { objectKeyToRouteSegment } from "@/lib/dynamic-object";
import type { MessageKey } from "@/i18n/messages";

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
            className="font-medium text-blue-600 hover:text-blue-800"
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
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
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
  const { t } = useI18n();

  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, objectKey);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, objectKey);
  const { data: record, error: recordError, isLoading: loadingRecord, mutate: mutateRecord } = useRecord(workspaceId, objectKey, recordId);
  const { data: relationsData } = useRelations(workspaceId, objectKey);

  useWorkspaceChangeEvent(workspaceId);

  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = loadingObj || loadingViews || loadingRecord;
  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === viewKey)?.config ?? null;
  const label = singularLabel ?? title;

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
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
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
      const res = await fetch(
        `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`,
        { method: "DELETE", headers: { "X-Requested-With": "XMLHttpRequest" } }
      );
      const json = await res.json();
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

  if (loading) {
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  if (!record) {
    return (
      <div className="space-y-4">
        {(error || recordError) && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error ?? (recordError instanceof Error ? recordError.message : t("workspace.recordNotFound"))}
          </div>
        )}
        <Link
          href={basePath}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← {backLabel ?? t("workspace.backToList", { title })}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={basePath}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            ← {backLabel ?? t("workspace.backToList", { title })}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {t("workspace.detailTitle", { title })}
          </h1>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("workspace.edit")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? t("workspace.deleting") : t("workspace.delete")}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {editing && viewConfig ? (
        <SchemaForm
          fields={fields}
          viewConfig={viewConfig}
          initialValues={record}
          onSubmit={handleUpdate}
          submitLabel={submitting ? t("workspace.saving") : t("workspace.save")}
          workspaceId={workspaceId}
        />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {fields.filter((field) => !fkFieldKeys.has(field.fieldKey)).map((field) => {
              const value = record[field.fieldKey];
              const isExtension =
                field.ownership === "workspace_extension";
              return (
                <div key={field.id}>
                  <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                    {field.label}
                    {isExtension && (
                      <span className="rounded bg-purple-100 px-1 text-[10px] font-medium text-purple-700">
                        {t("workspace.extension")}
                      </span>
                    )}
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">
                    {field.type === "boolean"
                      ? value
                        ? t("workspace.yes")
                        : t("workspace.no")
                      : value === null || value === undefined || value === ""
                        ? "—"
                        : String(value)}
                  </dd>
                </div>
              );
            })}
          </dl>

          {/* Parent record links */}
          {parentLinks.length > 0 && (
            <>
              {parentLinks.map((cfg) => (
                <ParentLinkPanel
                  key={cfg.foreignKey}
                  workspaceId={workspaceId}
                  record={record}
                  config={cfg}
                />
              ))}
            </>
          )}

          {/* Related records panels */}
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

          <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <p>{t("workspace.recordId", { id: String(record.id ?? "") })}</p>
            <p>{t("workspace.createdAt", { time: String(record.created_at ?? "") })}</p>
            <p>{t("workspace.updatedAt", { time: String(record.updated_at ?? "") })}</p>
          </div>
        </div>
      )}
    </div>
  );
}
