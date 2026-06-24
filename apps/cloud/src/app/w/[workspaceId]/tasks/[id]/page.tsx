"use client";

import { useParams } from "next/navigation";
import ObjectDetailPage from "@/components/ObjectDetailPage";

export default function TaskDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectDetailPage
      objectKey="task"
      viewKey="task_form"
      basePath={`/w/${workspaceId}/tasks`}
      title="任务"
      parentLinks={[
        {
          foreignKey: "company_id",
          parentObjectKey: "company",
          label: "关联公司",
          titleField: "name",
          routeBase: "/w/{workspaceId}/companies",
        },
        {
          foreignKey: "deal_id",
          parentObjectKey: "deal",
          label: "关联商机",
          titleField: "name",
          routeBase: "/w/{workspaceId}/deals",
        },
      ]}
    />
  );
}
