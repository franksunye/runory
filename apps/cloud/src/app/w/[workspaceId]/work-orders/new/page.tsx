"use client";

import { useParams } from "next/navigation";
import ObjectCreatePage from "@/components/ObjectCreatePage";

export default function NewWorkOrderPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectCreatePage
      objectKey="work_order"
      viewKey="work_order_form"
      basePath={`/w/${workspaceId}/work-orders`}
      title="工单"
      subtitle="填写工单信息后保存"
    />
  );
}
