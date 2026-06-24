"use client";

import { useParams } from "next/navigation";
import ObjectDetailPage from "@/components/ObjectDetailPage";

export default function DealDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectDetailPage
      objectKey="deal"
      viewKey="deal_form"
      basePath={`/w/${workspaceId}/deals`}
      title="商机"
      parentLinks={[
        {
          foreignKey: "company_id",
          parentObjectKey: "company",
          label: "关联公司",
          titleField: "name",
          routeBase: "/w/{workspaceId}/companies",
        },
      ]}
      related={[
        {
          objectKey: "task",
          foreignKey: "deal_id",
          label: "关联任务",
          titleField: "title",
          routeBase: "/w/{workspaceId}/tasks",
          secondaryFields: ["status"],
        },
      ]}
    />
  );
}
