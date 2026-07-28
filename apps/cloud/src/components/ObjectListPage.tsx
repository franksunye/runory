"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, PackageOpen, Settings, Save, RotateCcw } from "lucide-react";
import SchemaTable from "./SchemaTable";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useInstallations,
  useFields,
  useViews,
  useRecords,
  useWorkspaceAccess,
  useWorkspaceChangeEvent,
  useViewPreference,
} from "@/lib/api-hooks";
import { useI18n } from "@/i18n/locale-provider";
import { extractViewActions, filterActionsByPermission } from "@/lib/view-actions";
import { EmptyState, LoadingState, ErrorState } from "@/components/states";
import { PageHeader } from "@/components/layout";
import { ViewSelector, FilterBar, ColumnSettings, PageSizeSelector } from "@/components/view-bar";
import {
  buildPreferenceInput,
} from "@/lib/view-preference-resolver";
import { apiFetch } from "@/lib/api-fetch";

export interface SortOption {
  value: string;
  label: string;
}

export interface ObjectListPageProps {
  objectKey: string;
  viewKey: string;
  basePath: string;
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  sortOptions?: SortOption[];
  createLabel?: string;
  packName?: string;
  pageSize?: number;
}

export default function ObjectListPage({
  objectKey,
  viewKey,
  basePath,
  title,
  subtitle,
  searchPlaceholder,
  sortOptions,
  createLabel,
  packName,
  pageSize = 20,
}: ObjectListPageProps) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.workspaceId as string;
  const { t } = useI18n();

  const effectiveSubtitle = subtitle ?? t("workspace.subtitle");
  const effectiveSearchPlaceholder = searchPlaceholder ?? t("workspace.search");
  const effectiveCreateLabel = createLabel ?? t("workspace.addRecord");
  const effectiveSortOptions = sortOptions ?? [
    { value: "created_at:desc", label: t("workspace.sortNewest") },
    { value: "created_at:asc", label: t("workspace.sortOldest") },
  ];

  const { data: installations = [], isLoading: loadingInst } = useInstallations(workspaceId);
  const { data: workspaceAccess } = useWorkspaceAccess(workspaceId);
  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, objectKey);
  const { data: views = [], isLoading: loadingViews, error: viewError, mutate: mutateViews } = useViews(workspaceId, objectKey);

  // Resolve the view definition for preference lookup
  const viewDef = views.find((v) => v.viewKey === viewKey);
  const viewDefId = viewDef?.id ?? null;
  const { data: preference, mutate: mutatePreference } = useViewPreference(workspaceId, viewDefId);

  // URL query state: q (search), sort, filter.*
  const urlSearch = searchParams.get("q") ?? "";
  const urlSort = searchParams.get("sort") ?? "";
  const relationFilters = useMemo(() => {
    const filters: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith("filter.") && value) filters[key.slice("filter.".length)] = value;
    }
    return filters;
  }, [searchParams]);

  // Local search input (debounced). Initialized from URL, then user-controlled.
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch);

  // Sync search input when URL changes (e.g., back/forward, shared link)
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Build view defaults from the resolved view config
  const viewConfig = viewDef?.config ?? null;
  const viewColumns = useMemo(() => {
    if (!viewConfig || !Array.isArray(viewConfig.columns)) return [];
    return viewConfig.columns as Array<{ field: string; label?: string; width?: "sm" | "md" | "lg" }>;
  }, [viewConfig]);

  // Sort: use URL sort if present, otherwise preference sort, otherwise default
  const effectiveSortValue = urlSort || (preference?.sort ? `${preference.sort.field}:${preference.sort.direction}` : "") || effectiveSortOptions[0]?.value || "created_at:desc";
  const [sortBy, sortOrder] = useMemo(() => {
    const [field, order] = effectiveSortValue.split(":");
    return [field, (order as "asc" | "desc") ?? "desc"];
  }, [effectiveSortValue]);

  // Page size from preference or prop default
  const effectivePageSize = preference?.pageSize ?? pageSize;

  // ── Local state for view configuration (modified by ViewBar, persisted on Save) ──
  const allColumnFields = useMemo(() => viewColumns.map((c) => c.field), [viewColumns]);
  const [visibleFields, setVisibleFields] = useState<string[]>(allColumnFields);
  const [currentPageSize, setCurrentPageSize] = useState(effectivePageSize);
  const [resetting, setResetting] = useState(false);

  // Sync local state when preference loads or changes (e.g. after Save/Reset)
  useEffect(() => {
    if (preference?.visibleFields?.length) {
      const prefSet = new Set(preference.visibleFields);
      const filtered = allColumnFields.filter((f) => prefSet.has(f));
      setVisibleFields(filtered.length > 0 ? filtered : allColumnFields);
    } else {
      setVisibleFields(allColumnFields);
    }
  }, [preference, allColumnFields]);

  useEffect(() => {
    setCurrentPageSize(effectivePageSize);
  }, [effectivePageSize]);

  const [visibleCount, setVisibleCount] = useState(effectivePageSize);

  useEffect(() => {
    setVisibleCount(currentPageSize);
  }, [debouncedSearch, effectiveSortValue, currentPageSize, relationFilters]);

  const { data: records = [], isLoading: loadingRecords, error: recordError, mutate: mutateRecords } = useRecords(workspaceId, objectKey, {
    search: debouncedSearch || undefined,
    sortBy,
    sortOrder,
    filters: relationFilters,
  });

  useWorkspaceChangeEvent(workspaceId);

  const hasPack = installations.length > 0;
  const permissions = new Set(workspaceAccess?.accessSummary?.permissions ?? []);
  const commandOnlyObject = new Set([
    "invoice",
    "invoice_line",
    "invoice_payment_allocation",
    "payment_request",
    "payment",
    "refund",
    "payment_provider_account",
    "payment_provider_reference",
  ]).has(objectKey);
  const canCreate = !commandOnlyObject && (workspaceAccess?.workspaceRole === "admin"
    || permissions.has("*")
    || (objectKey === "quote" ? permissions.has("quote.create")
      : objectKey === "work_order" ? permissions.has("work_order.triage")
      // Visits are contextual execution records; Plan & dispatch is the sole
      // creation path, so a standalone list never presents a misleading Add.
      : objectKey === "service_visit" ? false
      : permissions.has(`${objectKey}.create`)));
  const loading = loadingInst || (hasPack && (loadingObj || loadingViews || loadingRecords));

  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewActions = filterActionsByPermission(
    extractViewActions(viewConfig as Record<string, unknown> | null),
    permissions,
  );
  const hasCreateAction = viewActions.some((a) => a.key === "create" && a.kind === "navigate");

  const effectiveColumns = useMemo(() => {
    const visSet = new Set(visibleFields);
    return viewColumns.filter((c) => visSet.has(c.field));
  }, [viewColumns, visibleFields]);

  const effectiveViewConfig = useMemo(() => {
    if (!viewConfig) return null;
    return { ...viewConfig, columns: effectiveColumns };
  }, [viewConfig, effectiveColumns]);

  // ── ViewBar action handlers ──

  // Add a filter by updating URL params
  const handleAddFilter = useCallback((field: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(`filter.${field}`, value);
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, basePath]);

  // Remove a filter by updating URL params
  const handleRemoveFilter = useCallback((field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(`filter.${field}`);
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, basePath]);

  // Toggle column visibility
  const handleColumnChange = useCallback((newVisible: string[]) => {
    setVisibleFields(newVisible);
  }, []);

  // Change page size
  const handlePageSizeChange = useCallback((size: number) => {
    setCurrentPageSize(size);
    setVisibleCount(size);
  }, []);

  // Reset to defaults: delete preference, clear URL params, reset local state
  const handleReset = useCallback(async () => {
    if (!viewDefId) return;
    if (!window.confirm(t("workspace.viewBar.resetConfirm"))) return;
    setResetting(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/views/${viewDefId}/preference`, {
        method: "DELETE",
      });
      void mutatePreference();
      // Clear all URL params (search, sort, filters)
      router.replace(basePath, { scroll: false });
      // Reset local state to defaults
      setVisibleFields(allColumnFields);
      setCurrentPageSize(pageSize);
      setVisibleCount(pageSize);
    } catch {
      // Error silently swallowed; user can retry
    } finally {
      setResetting(false);
    }
  }, [viewDefId, workspaceId, mutatePreference, router, basePath, allColumnFields, pageSize, t]);

  // Save current state as a view preference (explicit action)
  const [saving, setSaving] = useState(false);
  const handleSavePreferences = useCallback(async () => {
    if (!viewDefId) return;
    setSaving(true);
    try {
      const stateForSave = {
        search: debouncedSearch,
        sortBy,
        sortOrder,
        filters: relationFilters,
        pageSize: currentPageSize,
        visibleFields,
      };
      const input = buildPreferenceInput(stateForSave, preference?.version);
      await apiFetch(`/api/workspaces/${workspaceId}/views/${viewDefId}/preference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      void mutatePreference();
    } catch {
      // Error is silently swallowed; the SWR cache stays stale and the user can retry.
    } finally {
      setSaving(false);
    }
  }, [viewDefId, debouncedSearch, sortBy, sortOrder, relationFilters, currentPageSize, visibleFields, preference, workspaceId, mutatePreference]);

  // Extension field notice
  const extensionFields = fields.filter((f) => f.ownership === "workspace_extension");
  const extensionSignature = useMemo(
    () => extensionFields.map((f) => f.fieldKey).sort().join("|"),
    [extensionFields]
  );
  const extensionNoticeKey = `runory:${workspaceId}:${objectKey}:extension-notice:${extensionSignature}`;
  const [showExtensionNotice, setShowExtensionNotice] = useState(false);

  useEffect(() => {
    if (!extensionSignature) {
      setShowExtensionNotice(false);
      return;
    }
    setShowExtensionNotice(localStorage.getItem(extensionNoticeKey) !== "dismissed");
  }, [extensionNoticeKey, extensionSignature]);

  const dismissExtensionNotice = () => {
    localStorage.setItem(extensionNoticeKey, "dismissed");
    setShowExtensionNotice(false);
  };

  const handleCreate = () => router.push(`${basePath}/new`);
  const clearSearch = () => setSearchInput("");
  const errorMessage =
    recordError?.message || viewError?.message || t("surface.error.description");
  const handleRetry = () => {
    if (recordError) void mutateRecords();
    if (viewError) void mutateViews();
  };
  const headerActions = (
    <>
      {hasPack && viewDefId && (
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting || !preference}
          className="app-button-secondary"
          title={t("workspace.viewBar.reset")}
        >
          <RotateCcw size={15} />
          {resetting ? t("surface.loading") : t("workspace.viewBar.reset")}
        </button>
      )}
      {hasPack && viewDefId && (
        <button
          type="button"
          onClick={handleSavePreferences}
          disabled={saving}
          className="app-button-secondary"
          title={t("workspace.savePreferences")}
        >
          <Save size={16} />
          {saving ? t("surface.loading") : t("workspace.savePreferences")}
        </button>
      )}
      {hasPack && canCreate && hasCreateAction ? (
        <button type="button" onClick={handleCreate} className="app-button-primary">
          <Plus size={16} />{effectiveCreateLabel}
        </button>
      ) : null}
    </>
  );

  if (loading) {
    return <LoadingState variant="page" />;
  }

  const totalCount = records.length;
  const visibleRecords = records.slice(0, visibleCount);
  const hasMore = visibleCount < totalCount;
  const isSearching = debouncedSearch.length > 0;

  return (
    <div className="space-y-6 page-enter">
      <PageHeader
        eyebrow={packName}
        title={title}
        subtitle={effectiveSubtitle}
        actions={headerActions}
      />

      {!hasPack ? (
        <EmptyState
          icon={PackageOpen}
          title={t("workspace.noPack")}
          description={t("workspace.noPackHint", { packName: packName ?? "" })}
          action={{
            label: t("workspace.goDashboard"),
            onClick: () => router.push(`/w/${workspaceId}/dashboard`),
            tone: "primary",
          }}
        />
      ) : (recordError || viewError) ? (
        <ErrorState
          description={errorMessage}
          retryAction={{ label: t("surface.error.retry"), onClick: handleRetry }}
        />
      ) : effectiveViewConfig ? (
        <div className="space-y-3">
          {showExtensionNotice && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">{t("workspace.extensionNotice")}</p>
                  <p className="mt-1 text-purple-800">
                    {t("workspace.extensionNoticeBody", {
                      fields: extensionFields.map((f) => f.label).join(", "),
                      title,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissExtensionNotice}
                  className="min-w-fit rounded-md border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-100"
                >
                  {t("workspace.dismiss")}
                </button>
              </div>
            </div>
          )}

          {/* ViewBar: view selector, search, sort, column settings, page size */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <ViewSelector
                workspaceId={workspaceId}
                objectKey={objectKey}
                currentViewKey={viewKey}
                basePath={basePath}
              />
              <div className="relative w-full max-w-sm">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={effectiveSearchPlaceholder}
                  className="app-input pl-9"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={effectiveSortValue}
                onChange={(e) => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("sort", e.target.value);
                  router.replace(`${basePath}?${params.toString()}`, { scroll: false });
                }}
                className="app-input max-w-[200px]"
              >
                {effectiveSortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ColumnSettings
                columns={viewColumns}
                visibleFields={visibleFields}
                onChange={handleColumnChange}
              />
              <PageSizeSelector
                value={currentPageSize}
                onChange={handlePageSizeChange}
              />
            </div>
          </div>

          {/* FilterBar: active filter chips + add filter */}
          <FilterBar
            fields={fields}
            activeFilters={relationFilters}
            onRemoveFilter={handleRemoveFilter}
            onAddFilter={handleAddFilter}
            workspaceId={workspaceId}
            objectKey={objectKey}
          />

          <p className="text-xs text-slate-500">{t("workspace.recordCount", { count: totalCount })}</p>

          {totalCount === 0 ? (
            isSearching ? (
              <EmptyState
                icon={Search}
                title={t("surface.empty.noResults")}
                action={{ label: t("surface.empty.clearSearch"), onClick: clearSearch }}
              />
            ) : (
              <EmptyState
                title={t("workspace.noRecords", { title })}
                action={
                  canCreate && hasCreateAction
                    ? { label: t("workspace.add", { title }), onClick: handleCreate, tone: "primary" }
                    : undefined
                }
              />
            )
          ) : (
            <>
              <SchemaTable
                fields={fields}
                viewConfig={effectiveViewConfig}
                records={visibleRecords}
                workspaceId={workspaceId}
                objectKey={objectKey}
                basePath={basePath}
              />
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + effectivePageSize)}
                    className="app-button-secondary"
                  >
                    {t("workspace.loadMore")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <EmptyState icon={Settings} title={t("workspace.viewNotFound")} />
      )}
    </div>
  );
}
