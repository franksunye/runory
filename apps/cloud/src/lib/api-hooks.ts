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
} from "@runory/platform-core";
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

export function useNavigation(workspaceId: string) {
  const { data, error, isLoading, mutate } = useSWR<NavigationItem[]>(
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
