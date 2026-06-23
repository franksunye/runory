"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SchemaTable from "@/components/SchemaTable";
import type { FieldDefinition } from "@runory/platform-core";
import {
  useInstallations,
  useFields,
  useViews,
  useRecords,
  useWorkspaceChangeEvent,
} from "@/lib/api-hooks";

const OBJECT_KEY = "task";
const VIEW_KEY = "task_list";
const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "创建时间（最新）" },
  { value: "created_at:asc", label: "创建时间（最早）" },
  { value: "title:asc", label: "任务标题（A-Z）" },
  { value: "title:desc", label: "任务标题（Z-A）" },
  { value: "due_date:asc", label: "截止日期（最近）" },
  { value: "due_date:desc", label: "截止日期（最远）" },
];

export default function TaskListPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  const { data: installations = [], isLoading: loadingInst } = useInstallations(workspaceId);
  const { data: objDetail, isLoading: loadingObj } = useFields(workspaceId, OBJECT_KEY);
  const { data: views = [], isLoading: loadingViews } = useViews(workspaceId, OBJECT_KEY);

  // Search (debounced) + sort state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortValue, setSortValue] = useState("created_at:desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [sortBy, sortOrder] = useMemo(() => {
    const [field, order] = sortValue.split(":");
    return [field, (order as "asc" | "desc") ?? "desc"];
  }, [sortValue]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, sortValue]);

  const { data: records = [], isLoading: loadingRecords } = useRecords(workspaceId, OBJECT_KEY, {
    search: debouncedSearch || undefined,
    sortBy,
    sortOrder,
  });

  useWorkspaceChangeEvent(workspaceId);

  const hasPack = installations.length > 0;
  const loading = loadingInst || (hasPack && (loadingObj || loadingViews || loadingRecords));

  const fields: FieldDefinition[] = objDetail?.fields ?? [];
  const viewConfig = views.find((v) => v.viewKey === VIEW_KEY)?.config ?? null;

  if (loading) {
    return <p className="text-sm text-slate-400">加载中...</p>;
  }

  const totalCount = records.length;
  const visibleRecords = records.slice(0, visibleCount);
  const hasMore = visibleCount < totalCount;
  const isSearching = debouncedSearch.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">任务</h1>
          <p className="mt-1 text-sm text-slate-500">管理所有任务记录</p>
        </div>
        {hasPack && (
          <button
            type="button"
            onClick={() =>
              router.push(`/w/${workspaceId}/tasks/new`)
            }
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            添加任务
          </button>
        )}
      </div>

      {!hasPack ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-8 text-center">
          <p className="text-base font-semibold text-blue-800">尚未安装业务模块</p>
          <p className="mt-1 text-sm text-blue-700">安装 CRM Lite Pack 后即可开始管理任务。</p>
          <Link
            href={`/w/${workspaceId}/dashboard`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            安装 CRM Lite Pack
          </Link>
        </div>
      ) : viewConfig ? (
        <div className="space-y-3">
          {/* Search + Sort toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索任务标题、描述、负责人..."
              className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={sortValue}
              onChange={(e) => setSortValue(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Record count */}
          <p className="text-xs text-slate-500">共 {totalCount} 条记录</p>

          {/* Empty states */}
          {totalCount === 0 ? (
            isSearching ? (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-slate-500">没有找到匹配的记录</p>
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  清除搜索
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-slate-500">还没有任务记录</p>
                <button
                  type="button"
                  onClick={() => router.push(`/w/${workspaceId}/tasks/new`)}
                  className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  添加第一个任务
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
                objectKey={OBJECT_KEY}
              />
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="rounded-md border border-slate-300 bg-white px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    加载更多
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">未找到列表视图配置。</p>
      )}
    </div>
  );
}
