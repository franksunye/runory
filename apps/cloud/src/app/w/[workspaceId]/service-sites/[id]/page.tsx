"use client";

import { useParams } from "next/navigation";
import ObjectDetailPage from "@/components/ObjectDetailPage";

export default function ServiceSiteDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectDetailPage
      objectKey="service_site"
      viewKey="service_site_form"
      basePath={`/w/${workspaceId}/service-sites`}
      title="服务地点"
      related={[
        {
          objectKey: "asset",
          foreignKey: "site_id",
          label: "关联资产",
          titleField: "name",
          routeBase: "/w/{workspaceId}/assets",
          secondaryFields: ["status"],
        },
        {
          objectKey: "work_order",
          foreignKey: "site_id",
          label: "关联工单",
          titleField: "title",
          routeBase: "/w/{workspaceId}/work-orders",
          secondaryFields: ["status", "priority"],
        },
      ]}
    />
  );
}
