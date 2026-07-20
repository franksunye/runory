"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Inbox } from "lucide-react";
import SchemaTable from "./SchemaTable";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useInstallations,
  useFields,
  useViews,
  useRecords,
  useWorkspaceAccess,
  useWorkspaceChangeEvent,
} from "@/lib/api-hooks";
import { useI18n } from "@/i18n/locale-provider";

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
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, objectKey);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortValue, setSortValue] = useState(effectiveSortOptions[0]?.value ?? "created_at:desc");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const relationFilters = useMemo(() => {
    const filters: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith("filter.") && value) filters[key.slice("filter.".length)] = value;
    }
    return filters;
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [sortBy, sortOrder] = useMemo(() => {
    const [field, order] = sortValue.split(":");
    return [field, (order as "asc" | "desc") ?? "desc"];
  }, [sortValue]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [debouncedSearch, sortValue, pageSize, relationFilters]);

  const { data: records = [], isLoading: loadingRecords } = useRecords(workspaceId, objectKey, {
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
  const viewConfig = views.find((v) => v.viewKey === viewKey)?.config ?? null;

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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="app-skeleton h-3 w-28" />
            <div className="app-skeleton h-8 w-56" />
          </div>
          <div className="app-skeleton h-10 w-32 rounded-lg" />
        </div>
        <div className="app-card overflow-hidden p-0">
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="app-skeleton h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalCount = records.length;
  const visibleRecords = records.slice(0, visibleCount);
  const hasMore = visibleCount < totalCount;
  const isSearching = debouncedSearch.length > 0;

  return (
    <div className="space-y-6 page-enter">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {packName && <p className="app-eyebrow">{packName}</p>}
          <h1 className="mt-2 text-3xl font-bold tracking-[-.025em] text-slate-950">{title}</h1>
          {effectiveSubtitle && <p className="mt-2 text-sm text-slate-500">{effectiveSubtitle}</p>}
        </div>
        {hasPack && canCreate && (
          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => router.push(`${basePath}/new`)}
              className="app-button-primary"
            >
              <Plus size={16} />{effectiveCreateLabel}
            </button>
          </div>
        )}
      </header>

      {!hasPack ? (
        <div className="app-card flex flex-col items-center px-6 py-12 text-center">
          <Inbox size={32} className="text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-800">{t("workspace.noPack")}</p>
          <p className="mt-1 text-sm text-slate-500">
            {packName ? t("workspace.noPackHint", { packName }) : t("workspace.noPackHint", { packName: "" })}
          </p>
          <Link
            href={`/w/${workspaceId}/dashboard`}
            className="app-button-primary mt-4"
          >
            {t("workspace.goDashboard")}
          </Link>
        </div>
      ) : viewConfig ? (
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <select
              value={sortValue}
              onChange={(e) => setSortValue(e.target.value)}
              className="app-input max-w-[200px]"
            >
              {effectiveSortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-slate-500">{t("workspace.recordCount", { count: totalCount })}</p>

          {totalCount === 0 ? (
            isSearching ? (
              <div className="app-card flex flex-col items-center px-6 py-12 text-center">
                <Search size={28} className="text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">{t("workspace.noResults")}</p>
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="app-button-secondary mt-4"
                >
                  {t("workspace.clearSearch")}
                </button>
              </div>
            ) : (
              <div className="app-card flex flex-col items-center px-6 py-12 text-center">
                <Inbox size={32} className="text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">{t("workspace.noRecords", { title })}</p>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => router.push(`${basePath}/new`)}
                    className="app-button-primary mt-4"
                  >
                    <Plus size={16} />{t("workspace.addFirst", { title })}
                  </button>
                )}
              </div>
            )
          ) : (
            <>
              <SchemaTable
                fields={fields}
                viewConfig={viewConfig}
                records={visibleRecords}
                workspaceId={workspaceId}
                objectKey={objectKey}
                basePath={basePath}
              />
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + pageSize)}
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
        <p className="text-sm text-slate-500">{t("workspace.viewNotFound")}</p>
      )}
    </div>
  );
}
