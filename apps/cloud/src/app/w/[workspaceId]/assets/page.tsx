"use client";

import { useParams } from "next/navigation";
import ObjectListPage from "@/components/ObjectListPage";

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "创建时间（最新）" },
  { value: "created_at:asc", label: "创建时间（最早）" },
  { value: "name:asc", label: "名称（A-Z）" },
  { value: "name:desc", label: "名称（Z-A）" },
  { value: "status:asc", label: "状态（A-Z）" },
];

export default function AssetListPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectListPage
      objectKey="asset"
      viewKey="asset_list"
      basePath={`/w/${workspaceId}/assets`}
      title="资产"
      subtitle="管理所有资产记录"
      searchPlaceholder="搜索资产名称、序列号、类型..."
      sortOptions={SORT_OPTIONS}
      createLabel="添加资产"
      packName="Field Service Pack"
    />
  );
}
