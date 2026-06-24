"use client";

import { useParams } from "next/navigation";
import ObjectListPage from "@/components/ObjectListPage";

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
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectListPage
      objectKey="task"
      viewKey="task_list"
      basePath={`/w/${workspaceId}/tasks`}
      title="任务"
      subtitle="管理所有任务记录"
      searchPlaceholder="搜索任务标题、描述、负责人..."
      sortOptions={SORT_OPTIONS}
      createLabel="添加任务"
      packName="CRM Lite Pack"
    />
  );
}
