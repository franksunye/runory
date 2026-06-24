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

export default function ServiceSiteListPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectListPage
      objectKey="service_site"
      viewKey="service_site_list"
      basePath={`/w/${workspaceId}/service-sites`}
      title="服务地点"
      subtitle="管理所有服务地点记录"
      searchPlaceholder="搜索地点名称、地址、城市..."
      sortOptions={SORT_OPTIONS}
      createLabel="添加服务地点"
      packName="Field Service Pack"
    />
  );
}
