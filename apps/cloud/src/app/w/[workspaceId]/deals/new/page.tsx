"use client";

import { useParams } from "next/navigation";
import ObjectCreatePage from "@/components/ObjectCreatePage";

export default function NewDealPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectCreatePage
      objectKey="deal"
      viewKey="deal_form"
      basePath={`/w/${workspaceId}/deals`}
      title="商机"
      subtitle="填写商机信息后保存"
    />
  );
}
