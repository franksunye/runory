"use client";

import { useParams } from "next/navigation";
import ObjectListPage from "@/components/ObjectListPage";

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "创建时间（最新）" },
  { value: "created_at:asc", label: "创建时间（最早）" },
  { value: "name:asc", label: "公司名称（A-Z）" },
  { value: "name:desc", label: "公司名称（Z-A）" },
  { value: "lifecycle_stage:asc", label: "生命周期阶段（A-Z）" },
];

export default function CompanyListPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectListPage
      objectKey="company"
      viewKey="company_list"
      basePath={`/w/${workspaceId}/companies`}
      title="公司"
      subtitle="管理所有公司记录"
      searchPlaceholder="搜索公司名称、域名、行业..."
      sortOptions={SORT_OPTIONS}
      createLabel="添加公司"
      packName="CRM Lite Pack"
    />
  );
}
