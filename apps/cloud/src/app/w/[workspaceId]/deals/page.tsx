"use client";

import { useParams } from "next/navigation";
import ObjectListPage from "@/components/ObjectListPage";

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "创建时间（最新）" },
  { value: "created_at:asc", label: "创建时间（最早）" },
  { value: "name:asc", label: "商机名称（A-Z）" },
  { value: "name:desc", label: "商机名称（Z-A）" },
  { value: "expected_close_date:asc", label: "预计成交日期（最近）" },
  { value: "amount:desc", label: "金额（从高到低）" },
];

export default function DealListPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectListPage
      objectKey="deal"
      viewKey="deal_list"
      basePath={`/w/${workspaceId}/deals`}
      title="商机"
      subtitle="管理所有商机记录"
      searchPlaceholder="搜索商机名称、阶段..."
      sortOptions={SORT_OPTIONS}
      createLabel="添加商机"
      packName="CRM Lite Pack"
    />
  );
}
