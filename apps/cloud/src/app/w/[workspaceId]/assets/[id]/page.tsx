"use client";

import { useParams } from "next/navigation";
import ObjectDetailPage from "@/components/ObjectDetailPage";

export default function AssetDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectDetailPage
      objectKey="asset"
      viewKey="asset_form"
      basePath={`/w/${workspaceId}/assets`}
      title="资产"
      parentLinks={[
        {
          foreignKey: "site_id",
          parentObjectKey: "service_site",
          label: "关联服务地点",
          titleField: "name",
          routeBase: "/w/{workspaceId}/service-sites",
        },
      ]}
      related={[
        {
          objectKey: "work_order",
          foreignKey: "asset_id",
          label: "关联工单",
          titleField: "title",
          routeBase: "/w/{workspaceId}/work-orders",
          secondaryFields: ["status", "priority"],
        },
      ]}
    />
  );
}
