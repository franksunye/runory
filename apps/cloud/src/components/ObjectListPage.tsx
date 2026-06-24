"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SchemaTable from "./SchemaTable";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useInstallations,
  useFields,
  useViews,
  useRecords,
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
  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, objectKey);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, objectKey);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortValue, setSortValue] = useState(effectiveSortOptions[0]?.value ?? "created_at:desc");
  const [visibleCount, setVisibleCount] = useState(pageSize);

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
  }, [debouncedSearch, sortValue, pageSize]);

  const { data: records = [], isLoading: loadingRecords } = useRecords(workspaceId, objectKey, {
    search: debouncedSearch || undefined,
    sortBy,
    sortOrder,
  });

  useWorkspaceChangeEvent(workspaceId);

  const hasPack = installations.length > 0;
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
    return <p className="text-sm text-slate-400">{t("workspace.loading")}</p>;
  }

  const totalCount = records.length;
  const visibleRecords = records.slice(0, visibleCount);
  const hasMore = visibleCount < totalCount;
  const isSearching = debouncedSearch.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {effectiveSubtitle && <p className="mt-1 text-sm text-slate-500">{effectiveSubtitle}</p>}
        </div>
        {hasPack && (
          <button
            type="button"
            onClick={() => router.push(`${basePath}/new`)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {effectiveCreateLabel}
          </button>
        )}
      </div>

      {!hasPack ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-8 text-center">
          <p className="text-base font-semibold text-blue-800">{t("workspace.noPack")}</p>
          <p className="mt-1 text-sm text-blue-700">
            {packName ? t("workspace.noPackHint", { packName }) : t("workspace.noPackHint", { packName: "" })}
          </p>
          <Link
            href={`/w/${workspaceId}/dashboard`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={effectiveSearchPlaceholder}
              className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={sortValue}
              onChange={(e) => setSortValue(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-slate-500">{t("workspace.noResults")}</p>
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t("workspace.clearSearch")}
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-slate-500">{t("workspace.noRecords", { title })}</p>
                <button
                  type="button"
                  onClick={() => router.push(`${basePath}/new`)}
                  className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {t("workspace.addFirst", { title })}
                </button>
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
                    className="rounded-md border border-slate-300 bg-white px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
