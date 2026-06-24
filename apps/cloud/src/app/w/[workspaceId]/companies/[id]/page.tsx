"use client";

import { useParams } from "next/navigation";
import ObjectDetailPage from "@/components/ObjectDetailPage";

export default function CompanyDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectDetailPage
      objectKey="company"
      viewKey="company_form"
      basePath={`/w/${workspaceId}/companies`}
      title="公司"
      related={[
        {
          objectKey: "contact",
          foreignKey: "primary_company_id",
          label: "关联联系人",
          titleField: "name",
          routeBase: "/w/{workspaceId}/contacts",
          secondaryFields: ["role", "email"],
        },
        {
          objectKey: "deal",
          foreignKey: "company_id",
          label: "关联商机",
          titleField: "name",
          routeBase: "/w/{workspaceId}/deals",
          secondaryFields: ["stage"],
        },
        {
          objectKey: "task",
          foreignKey: "company_id",
          label: "关联任务",
          titleField: "title",
          routeBase: "/w/{workspaceId}/tasks",
          secondaryFields: ["status"],
        },
      ]}
    />
  );
}
