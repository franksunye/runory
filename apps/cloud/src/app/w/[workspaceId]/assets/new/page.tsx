"use client";

import { useParams } from "next/navigation";
import ObjectCreatePage from "@/components/ObjectCreatePage";

export default function NewAssetPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectCreatePage
      objectKey="asset"
      viewKey="asset_form"
      basePath={`/w/${workspaceId}/assets`}
      title="资产"
      subtitle="填写资产信息后保存"
    />
  );
}
