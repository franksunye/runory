"use client";

import { useParams } from "next/navigation";
import ObjectDetailPage from "@/components/ObjectDetailPage";

export default function WorkOrderDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectDetailPage
      objectKey="work_order"
      viewKey="work_order_form"
      basePath={`/w/${workspaceId}/work-orders`}
      title="工单"
      parentLinks={[
        {
          foreignKey: "site_id",
          parentObjectKey: "service_site",
          label: "关联服务地点",
          titleField: "name",
          routeBase: "/w/{workspaceId}/service-sites",
        },
        {
          foreignKey: "asset_id",
          parentObjectKey: "asset",
          label: "关联资产",
          titleField: "name",
          routeBase: "/w/{workspaceId}/assets",
        },
      ]}
      related={[
        {
          objectKey: "service_visit",
          foreignKey: "work_order_id",
          label: "关联服务访问",
          titleField: "title",
          routeBase: "/w/{workspaceId}/service-visits",
          secondaryFields: ["status"],
        },
      ]}
    />
  );
}
