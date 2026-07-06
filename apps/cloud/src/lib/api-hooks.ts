"use client";

import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import type {
  AuditLog,
  ExtensionDefinition,
  FieldDefinition,
  NavigationItem,
  ObjectDefinition,
  RelationDefinition,
  ViewDefinition,
  WorkflowInstance,
} from "@runory/platform-core";
import type {
  WorkflowDefinition,
  WorkflowTransition,
} from "@runory/contracts";
import {
  WORKSPACE_NAVIGATION_CHANGED,
  WORKSPACE_DATA_CHANGED,
} from "./workspace-events";

// ── Types ──

export interface Installation {
  id: string;
  workspaceId: string;
  moduleId: string;
  moduleVersion: string;
  packId: string | null;
  status: string;
  installedAt: string;
}

export interface ObjectDetailResponse {
  object: ObjectDefinition;
  fields: FieldDefinition[];
}

export type WorkspaceRecord = Record<string, string | number | boolean | null>;

// ── Key builders ──

function workspaceKey(workspaceId: string, path: string): string {
  return `/api/workspaces/${workspaceId}/${path}`;
}

// ── Generic hook ──

export function useWorkspaceData<T = unknown>(
  workspaceId: string,
  path: string
) {
  const { data, error, isLoading, mutate } = useSWR<T>(
    workspaceKey(workspaceId, path)
  );
  return { data, error, isLoading, mutate };
}

// ── Specific hooks ──

export function useInstallations(workspaceId: string) {
  const { data, error, isLoading, mutate } = useSWR<Installation[]>(
    workspaceKey(workspaceId, "installations")
  );
  return { data, error, isLoading, mutate };
}

export function useObjects(workspaceId: string) {
  const { data, error, isLoading, mutate } = useSWR<ObjectDefinition[]>(
    workspaceKey(workspaceId, "objects")
  );
  return { data, error, isLoading, mutate };
}

export interface RecordsQueryParams {
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

function buildRecordsQuery(params?: RecordsQueryParams): string {
  if (!params) return "";
  const parts: string[] = [];
  if (params.search) parts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.sortBy) parts.push(`sortBy=${encodeURIComponent(params.sortBy)}`);
  if (params.sortOrder) parts.push(`sortOrder=${encodeURIComponent(params.sortOrder)}`);
  if (params.limit !== undefined) parts.push(`limit=${encodeURIComponent(String(params.limit))}`);
  if (params.offset !== undefined) parts.push(`offset=${encodeURIComponent(String(params.offset))}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function useRecords(
  workspaceId: string,
  objectKey: string,
  params?: RecordsQueryParams
) {
  const query = buildRecordsQuery(params);
  const { data, error, isLoading, mutate } = useSWR<WorkspaceRecord[]>(
    workspaceKey(workspaceId, `objects/${objectKey}/records${query}`)
  );
  return { data, error, isLoading, mutate };
}

export function useFields(workspaceId: string, objectKey: string) {
  const { data, error, isLoading, mutate } = useSWR<ObjectDetailResponse>(
    workspaceKey(workspaceId, `objects/${objectKey}`)
  );
  return { data, error, isLoading, mutate };
}

export function useViews(workspaceId: string, objectKey: string) {
  const { data, error, isLoading, mutate } = useSWR<ViewDefinition[]>(
    workspaceKey(workspaceId, `objects/${objectKey}/views`)
  );
  return { data, error, isLoading, mutate };
}

export interface RelationsResponse {
  relations: RelationDefinition[];
  backlinks: RelationDefinition[];
}

export function useRelations(workspaceId: string, objectKey: string) {
  const { data, error, isLoading, mutate } = useSWR<RelationsResponse>(
    workspaceKey(workspaceId, `objects/${objectKey}/relations`)
  );
  return { data, error, isLoading, mutate };
}

export function useExtensions(workspaceId: string) {
  const { data, error, isLoading, mutate } = useSWR<ExtensionDefinition[]>(
    workspaceKey(workspaceId, "extensions")
  );
  return { data, error, isLoading, mutate };
}

export function useAuditLogs(workspaceId: string, limit?: number) {
  const { data, error, isLoading, mutate } = useSWR<AuditLog[]>(
    workspaceKey(workspaceId, "audit")
  );
  const sliced = limit && data ? data.slice(0, limit) : data;
  return { data: sliced, error, isLoading, mutate };
}

export interface InstalledPackGroup {
  packId: string;
  packName: string;
  category: string;
  installedAt: string;
}

export interface NavigationApiResponse {
  items: NavigationItem[];
  packs: InstalledPackGroup[];
  modulePackMap: Record<string, string>;
}

export function useNavigation(workspaceId: string) {
  const { data, error, isLoading, mutate } = useSWR<NavigationApiResponse>(
    workspaceKey(workspaceId, "navigation")
  );
  return { data, error, isLoading, mutate };
}

export function useRecord(
  workspaceId: string,
  objectKey: string,
  recordId: string
) {
  const { data, error, isLoading, mutate } = useSWR<WorkspaceRecord>(
    workspaceKey(workspaceId, `objects/${objectKey}/records/${recordId}`)
  );
  return { data, error, isLoading, mutate };
}

// ── Workspace change event revalidation ──

export function useWorkspaceChangeEvent(workspaceId: string): void {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const revalidate = () => {
      // Mutate all SWR keys that belong to this workspace
      void mutate(
        (key) =>
          typeof key === "string" &&
          key.startsWith(`/api/workspaces/${workspaceId}/`)
      );
    };

    window.addEventListener(WORKSPACE_NAVIGATION_CHANGED, revalidate);
    window.addEventListener(WORKSPACE_DATA_CHANGED, revalidate);

    return () => {
      window.removeEventListener(WORKSPACE_NAVIGATION_CHANGED, revalidate);
      window.removeEventListener(WORKSPACE_DATA_CHANGED, revalidate);
    };
  }, [workspaceId, mutate]);
}

// ── Workflow Hooks (v0.4) ──

export function useWorkflowDefinitions(workspaceId: string) {
  const { data, error, isLoading, mutate } = useSWR<WorkflowDefinition[]>(
    workspaceKey(workspaceId, "workflows")
  );
  return { data, error, isLoading, mutate };
}

export interface RecordWorkflowData {
  instance: WorkflowInstance;
  definition: WorkflowDefinition;
  availableTransitions: WorkflowTransition[];
  isTerminal: boolean;
}

/**
 * Fetches the workflow instance bound to a specific record, along with
 * the definition and available transitions. Returns null when no workflow
 * is bound to the record.
 */
export function useRecordWorkflow(
  workspaceId: string,
  objectKey: string,
  recordId: string | undefined
) {
  const { data, error, isLoading, mutate } = useSWR<RecordWorkflowData | null>(
    recordId
      ? workspaceKey(workspaceId, `objects/${objectKey}/records/${recordId}/workflow`)
      : null
  );
  return { data, error, isLoading, mutate };
}

// ── v0.5 My Work Hooks ──

export interface MyWorkItem {
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

export interface MyWorkResponse {
  items: MyWorkItem[];
  total: number;
}

export interface MyWorkFilters {
  kind?: string;
  status?: string;
  subjectType?: string;
  dueBefore?: string;
  limit?: number;
  offset?: number;
}

export function useMyWork(workspaceId: string, filters?: MyWorkFilters) {
  const params = new URLSearchParams();
  if (filters?.kind) params.set("kind", filters.kind);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.subjectType) params.set("subjectType", filters.subjectType);
  if (filters?.dueBefore) params.set("dueBefore", filters.dueBefore);
  if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters?.offset !== undefined) params.set("offset", String(filters.offset));
  const query = params.toString() ? `?${params.toString()}` : "";
  const { data, error, isLoading, mutate } = useSWR<MyWorkResponse>(
    workspaceKey(workspaceId, `my-work${query}`)
  );
  return { data, error, isLoading, mutate };
}

// ── v0.5 Forms 2.0 Hooks ──

export interface FormDefinitionV2 {
  id: string;
  workspace_id: string;
  form_key: string;
  name: string;
  status: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormDefinitionDetail extends FormDefinitionV2 {
  schema_json?: string;
  layout_json?: string | null;
  version_number?: number;
}

export interface FormBindingV2 {
  id: string;
  workspace_id: string;
  form_definition_id: string;
  usage_type: string;
  usage_key: string | null;
  label_override: string | null;
  timing_json: string | null;
  requirement_policy: string;
  target_mapping_json: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface FormSubmissionV2 {
  id: string;
  workspace_id: string;
  form_definition_id: string;
  form_version_id: string;
  binding_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  work_item_id: string | null;
  revision_number: number;
  status: string;
  answers_json: string;
  submitted_by: string | null;
  submitted_at: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  return_reason: string | null;
  supersedes_submission_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useFormDefinitions(workspaceId: string) {
  const { data, error, isLoading, mutate } = useSWR<FormDefinitionV2[]>(
    workspaceKey(workspaceId, "forms/definitions")
  );
  return { data, error, isLoading, mutate };
}

export function useFormDefinition(workspaceId: string, formKey: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<FormDefinitionDetail | null>(
    formKey ? workspaceKey(workspaceId, `forms/definitions/${formKey}`) : null
  );
  return { data, error, isLoading, mutate };
}

export function useFormBindings(workspaceId: string) {
  const { data, error, isLoading, mutate } = useSWR<FormBindingV2[]>(
    workspaceKey(workspaceId, "forms/bindings")
  );
  return { data, error, isLoading, mutate };
}

export interface FormSubmissionFilters {
  subjectType?: string;
  subjectId?: string;
  workItemId?: string;
  bindingId?: string;
  status?: string;
}

export function useFormSubmissions(workspaceId: string, filters?: FormSubmissionFilters) {
  const params = new URLSearchParams();
  if (filters?.subjectType) params.set("subjectType", filters.subjectType);
  if (filters?.subjectId) params.set("subjectId", filters.subjectId);
  if (filters?.workItemId) params.set("workItemId", filters.workItemId);
  if (filters?.bindingId) params.set("bindingId", filters.bindingId);
  if (filters?.status) params.set("status", filters.status);
  const query = params.toString() ? `?${params.toString()}` : "";
  const { data, error, isLoading, mutate } = useSWR<FormSubmissionV2[]>(
    workspaceKey(workspaceId, `forms/submissions${query}`)
  );
  return { data, error, isLoading, mutate };
}

export function useFormSubmission(workspaceId: string, submissionId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<FormSubmissionV2 | null>(
    submissionId ? workspaceKey(workspaceId, `forms/submissions/${submissionId}`) : null
  );
  return { data, error, isLoading, mutate };
}

// ── v0.5 Planning Hooks ──

export interface PlanningEntry {
  id: string;
  workspace_id: string;
  resource_id: string;
  subject_type: string;
  subject_id: string;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  resource_name?: string;
  resource_type?: string;
  subject_name?: string;
}

export interface PlanningFilters {
  from?: string;
  to?: string;
  resourceIds?: string[];
  subjectType?: string;
  status?: string;
}

export function usePlanningEntries(workspaceId: string, filters?: PlanningFilters) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.resourceIds?.length) params.set("resourceIds", filters.resourceIds.join(","));
  if (filters?.subjectType) params.set("subjectType", filters.subjectType);
  if (filters?.status) params.set("status", filters.status);
  const query = params.toString() ? `?${params.toString()}` : "";
  const { data, error, isLoading, mutate } = useSWR<PlanningEntry[]>(
    workspaceKey(workspaceId, `planning/entries${query}`)
  );
  return { data, error, isLoading, mutate };
}

// ── v0.5 Outbox Diagnostics Hooks ──

export interface OutboxMessage {
  id: string;
  workspaceId: string;
  messageType: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export function useOutboxMessages(workspaceId: string, status?: string) {
  const query = status ? `?status=${status}` : "";
  const { data, error, isLoading, mutate } = useSWR<OutboxMessage[]>(
    workspaceKey(workspaceId, `outbox${query}`)
  );
  return { data, error, isLoading, mutate };
}

// ── v0.5 Workflow Instance V2 Hooks ──

export interface WorkflowInstanceV2 {
  id: string;
  workspace_id: string;
  workflow_definition_id: string;
  definition_version_id: string;
  object_type: string;
  record_id: string;
  status: string;
  current_step_id: string | null;
  version: number;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowInstanceDetailV2 extends WorkflowInstanceV2 {
  work_items: MyWorkItem[];
  events: WorkflowEventV2[];
  definition: {
    workflowKey: string;
    name: string;
    targetObject: string;
    initialState: string;
    steps: Array<{
      id: string;
      kind: string;
      next?: string;
      command?: string;
      assigneeRule?: { permissionGroup?: string; userId?: string };
      formBindingId?: string;
      onApprove?: string;
      onReject?: string;
    }>;
  };
}

export interface WorkflowEventV2 {
  id: string;
  instance_id: string;
  sequence: number;
  event_type: string;
  step_id: string | null;
  actor_type: string | null;
  actor_id: string | null;
  payload_json: string;
  occurred_at: string;
}

export function useWorkflowInstanceV2(
  workspaceId: string,
  instanceId: string | undefined
) {
  const { data, error, isLoading, mutate } = useSWR<WorkflowInstanceDetailV2 | null>(
    instanceId ? workspaceKey(workspaceId, `workflows/instances-v2/${instanceId}`) : null
  );
  return { data, error, isLoading, mutate };
}

// ── v0.5 Navigation with presentation ──

export interface NavigationApiResponseV2 extends NavigationApiResponse {
  modulePresentation: Record<string, { visibility: string; surface?: string; audience?: string[] }>;
}
