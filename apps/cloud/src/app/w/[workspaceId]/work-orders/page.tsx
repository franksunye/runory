"use client";

import { useParams } from "next/navigation";
import ObjectListPage from "@/components/ObjectListPage";

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "创建时间（最新）" },
  { value: "created_at:asc", label: "创建时间（最早）" },
  { value: "title:asc", label: "标题（A-Z）" },
  { value: "title:desc", label: "标题（Z-A）" },
  { value: "priority:desc", label: "优先级（高到低）" },
  { value: "status:asc", label: "状态（A-Z）" },
];

export default function WorkOrderListPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectListPage
      objectKey="work_order"
      viewKey="work_order_list"
      basePath={`/w/${workspaceId}/work-orders`}
      title="工单"
      subtitle="管理所有工单记录"
      searchPlaceholder="搜索工单标题、状态、优先级..."
      sortOptions={SORT_OPTIONS}
      createLabel="添加工单"
      packName="Field Service Pack"
    />
  );
}
