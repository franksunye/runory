"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, PackageOpen, Settings, Save, RotateCcw, Check, MoreHorizontal } from "lucide-react";
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
import { ViewSelector, FilterBar, SortPicker, ColumnSettings, PageSizeSelector, SaveViewDialog, ConfirmDialog } from "@/components/view-bar";
import {
  buildPreferenceInput,
} from "@/lib/view-preference-resolver";
import { apiFetch, type ApiResult } from "@/lib/api-fetch";

export interface ObjectListPageProps {
  objectKey: string;
  viewKey: string;
  basePath: string;
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
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
  const { data: installations = [], isLoading: loadingInst } = useInstallations(workspaceId);
  const { data: workspaceAccess } = useWorkspaceAccess(workspaceId);
  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, objectKey);
  const { data: views = [], isLoading: loadingViews, error: viewError, mutate: mutateViews } = useViews(workspaceId, objectKey);
  const fields: FieldDefinition[] = objDetail?.fields ?? [];

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

  // One-time sync: restore preference filters to URL on initial load.
  // After this, all filter operations go through URL params, so add/remove
  // works naturally and Save captures the full URL state.
  // The ref resets when the view definition changes so switching to a
  // different view re-applies that view's saved filters.
  const prefFiltersSyncedRef = useRef(false);
  useEffect(() => {
    prefFiltersSyncedRef.current = false;
  }, [viewDefId]);
  useEffect(() => {
    if (prefFiltersSyncedRef.current) return;
    if (preference === undefined) return; // SWR still loading

    prefFiltersSyncedRef.current = true;

    if (!preference?.filters?.length) return;

    // If URL already has filter params, they take precedence (shared link, etc.)
    const hasUrlFilters = Array.from(searchParams.keys()).some((k) => k.startsWith("filter."));
    if (hasUrlFilters) return;

    const params = new URLSearchParams(searchParams.toString());
    for (const f of preference.filters) {
      params.set(`filter.${f.field}`, String(f.value));
    }
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preference, viewDefId]);

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

  // Sorting is metadata-driven: every installed or dynamically-created field
  // becomes available without adding object-specific UI code. Keep the visible
  // view order first, then append the remaining object fields and system dates.
  const sortableFields = useMemo(() => {
    const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
    const orderedKeys = [
      ...viewColumns.map((column) => column.field),
      ...fields.map((field) => field.fieldKey),
    ];
    const seen = new Set<string>();
    const result: Array<{ field: string; label: string; type?: string }> = [];

    for (const fieldKey of orderedKeys) {
      if (seen.has(fieldKey)) continue;
      const field = fieldByKey.get(fieldKey);
      if (!field) continue;
      seen.add(fieldKey);
      result.push({ field: field.fieldKey, label: field.label, type: field.type });
    }

    if (!seen.has("created_at")) {
      result.push({ field: "created_at", label: t("workspace.viewBar.createdTime"), type: "datetime" });
    }
    if (!seen.has("updated_at")) {
      result.push({ field: "updated_at", label: t("workspace.viewBar.updatedTime"), type: "datetime" });
    }
    return result;
  }, [fields, viewColumns, t]);

  // Sort: use URL sort if present, otherwise preference sort, otherwise default
  const effectiveSortValue = urlSort || (preference?.sort ? `${preference.sort.field}:${preference.sort.direction}` : "") || "created_at:desc";
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

  const preferenceDirty = useMemo(() => {
    const savedSort = preference?.sort
      ? `${preference.sort.field}:${preference.sort.direction}`
      : "created_at:desc";
    const savedPageSize = preference?.pageSize ?? pageSize;
    const savedFields = preference?.visibleFields?.length
      ? allColumnFields.filter((field) => preference.visibleFields?.includes(field))
      : allColumnFields;
    const savedFilters = (preference?.filters ?? [])
      .map((filter) => [filter.field, String(filter.value)] as const)
      .sort(([left], [right]) => left.localeCompare(right));
    const currentFilters = Object.entries(relationFilters)
      .sort(([left], [right]) => left.localeCompare(right));

    return effectiveSortValue !== savedSort
      || currentPageSize !== savedPageSize
      || visibleFields.join("|") !== savedFields.join("|")
      || JSON.stringify(currentFilters) !== JSON.stringify(savedFilters);
  }, [preference, pageSize, allColumnFields, relationFilters, effectiveSortValue, currentPageSize, visibleFields]);

  const canManageViews = workspaceAccess?.workspaceRole === "admin"
    || workspaceAccess?.workspaceRole === "owner"
    || permissions.has("*");
  const canResetView = Boolean(preference) || Boolean(urlSearch || urlSort || Object.keys(relationFilters).length);

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
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const handleReset = useCallback(async () => {
    if (!viewDefId) return;
    setResetConfirmOpen(false);
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
  }, [viewDefId, workspaceId, mutatePreference, router, basePath, allColumnFields, pageSize]);

  // Save current state as a new custom view definition (with name)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savingView, setSavingView] = useState(false);

  // Default name for the new custom view
  const defaultViewName = useMemo(() => {
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${title} — ${dateStr}`;
  }, [title]);

  const handleCreateCustomView = useCallback(async (name: string) => {
    setSavingView(true);
    try {
      // Build the view config from the current effective columns + actions
      const config = {
        columns: effectiveColumns,
        actions: viewActions,
      };

      // 1. Create the custom view definition
      const res = await apiFetch<ApiResult<{ id: string; viewKey: string }>>(
        `/api/workspaces/${workspaceId}/views`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectKey, label: name, config }),
        },
      );
      const created = res.data;

      // 2. Save current filter/sort/pageSize/visibleFields as a preference for the new view
      const stateForSave = {
        search: "",
        sortBy,
        sortOrder,
        filters: relationFilters,
        pageSize: currentPageSize,
        visibleFields,
      };
      const prefInput = buildPreferenceInput(stateForSave, undefined);
      await apiFetch(`/api/workspaces/${workspaceId}/views/${created.id}/preference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefInput),
      });

      // 3. Optimistically update the views cache with the new view definition,
      //    then navigate. This avoids a flash of "View not found" while SWR
      //    revalidates in the background.
      mutateViews((current) => [
        ...(current ?? []),
        {
          id: created.id,
          workspaceId,
          objectKey,
          viewKey: created.viewKey,
          viewType: "list" as const,
          label: name,
          config,
          moduleId: null,
          extensionId: null,
        },
      ], false);
      setSaveDialogOpen(false);
      router.push(`${basePath}?view=${created.viewKey}`);
    } catch {
      // Error silently swallowed; user can retry
    } finally {
      setSavingView(false);
    }
  }, [effectiveColumns, viewActions, workspaceId, objectKey, sortBy, sortOrder, relationFilters, currentPageSize, visibleFields, mutateViews, router, basePath]);

  // Save current state as preference for the EXISTING view (not a new view)
  const [savingPreference, setSavingPreference] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  const handleSavePreference = useCallback(async () => {
    if (!viewDefId) return;
    setSavingPreference(true);
    try {
      const stateForSave = {
        search: "",
        sortBy,
        sortOrder,
        filters: relationFilters,
        pageSize: currentPageSize,
        visibleFields,
      };
      const prefInput = buildPreferenceInput(stateForSave, undefined);
      await apiFetch(`/api/workspaces/${workspaceId}/views/${viewDefId}/preference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefInput),
      });
      void mutatePreference();
      // Show "Saved!" feedback for 2 seconds
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    } catch {
      // Error silently swallowed; user can retry
    } finally {
      setSavingPreference(false);
    }
  }, [viewDefId, workspaceId, sortBy, sortOrder, relationFilters, currentPageSize, visibleFields, mutatePreference]);

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
          <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ViewSelector
                workspaceId={workspaceId}
                objectKey={objectKey}
                currentViewKey={viewKey}
                basePath={basePath}
                labels={{
                  rename: t("workspace.viewBar.rename"),
                  delete: t("workspace.viewBar.delete"),
                  deleteTitle: t("workspace.viewBar.deleteTitle"),
                  deleteConfirm: t("workspace.viewBar.deleteConfirm"),
                  cancel: t("workspace.viewBar.cancel"),
                }}
              />
              <div className="relative min-w-0 flex-1 lg:max-w-md">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={effectiveSearchPlaceholder}
                  className="app-input h-10 pl-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1 lg:shrink-0 lg:flex-nowrap">
              <SortPicker
                fields={sortableFields}
                field={sortBy}
                direction={sortOrder}
                onChange={(field, direction) => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("sort", `${field}:${direction}`);
                  router.replace(`${basePath}?${params.toString()}`, { scroll: false });
                }}
                labels={{
                  title: t("workspace.viewBar.sort"),
                  ascending: t("workspace.viewBar.sortAscending"),
                  descending: t("workspace.viewBar.sortDescending"),
                  searchFields: t("workspace.viewBar.searchFields"),
                  fields: t("workspace.viewBar.sortableFields"),
                  noFields: t("workspace.viewBar.noSortableFields"),
                  close: t("workspace.viewBar.closeSort"),
                }}
              />
              <ColumnSettings
                columns={viewColumns}
                visibleFields={visibleFields}
                onChange={handleColumnChange}
              />
              <PageSizeSelector
                value={currentPageSize}
                onChange={handlePageSizeChange}
              />
              {hasPack && viewDefId && (preferenceDirty || canManageViews || canResetView) ? (
                <details className="group/view-options relative">
                  <summary
                    className="app-button-ghost flex cursor-pointer list-none"
                    aria-label={t("workspace.viewBar.save")}
                    title={t("workspace.viewBar.save")}
                  >
                    <MoreHorizontal size={18} />
                  </summary>
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-[210px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    {preferenceDirty ? (
                      <button
                        type="button"
                        onClick={() => void handleSavePreference()}
                        disabled={savingPreference}
                        className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Check size={15} />
                        {savedFeedback ? t("workspace.viewBar.saved") : savingPreference ? t("surface.loading") : t("workspace.viewBar.save")}
                      </button>
                    ) : null}
                    {canManageViews ? (
                      <button
                        type="button"
                        onClick={() => setSaveDialogOpen(true)}
                        className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Save size={15} />{t("workspace.viewBar.saveAsView")}
                      </button>
                    ) : null}
                    {canResetView ? (
                      <button
                        type="button"
                        onClick={() => setResetConfirmOpen(true)}
                        disabled={resetting}
                        className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RotateCcw size={15} />
                        {resetting ? t("surface.loading") : t("workspace.viewBar.reset")}
                      </button>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          {/* FilterBar: active filter chips + add filter */}
          <div className="mt-2 border-t border-slate-100 px-1 pt-2">
            <FilterBar
              fields={fields}
              activeFilters={relationFilters}
              onRemoveFilter={handleRemoveFilter}
              onAddFilter={handleAddFilter}
              workspaceId={workspaceId}
              objectKey={objectKey}
            />
          </div>
          </div>

          <p className="px-1 text-xs font-medium text-slate-500">{t("workspace.recordCount", { count: totalCount })}</p>

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

      <SaveViewDialog
        open={saveDialogOpen}
        defaultName={defaultViewName}
        onSave={handleCreateCustomView}
        onClose={() => setSaveDialogOpen(false)}
        saving={savingView}
        labels={{
          title: t("workspace.viewBar.saveAsView"),
          placeholder: t("workspace.viewBar.viewNamePlaceholder"),
          save: t("workspace.viewBar.save"),
          cancel: t("workspace.viewBar.cancel"),
        }}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        title={t("workspace.viewBar.resetTitle")}
        message={t("workspace.viewBar.resetConfirm")}
        confirmLabel={t("workspace.viewBar.reset")}
        cancelLabel={t("workspace.viewBar.cancel")}
        onConfirm={() => void handleReset()}
        onClose={() => setResetConfirmOpen(false)}
        loading={resetting}
      />
    </div>
  );
}
