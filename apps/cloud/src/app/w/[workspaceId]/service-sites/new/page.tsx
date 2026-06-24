"use client";

import { useParams } from "next/navigation";
import ObjectCreatePage from "@/components/ObjectCreatePage";

export default function NewServiceSitePage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectCreatePage
      objectKey="service_site"
      viewKey="service_site_form"
      basePath={`/w/${workspaceId}/service-sites`}
      title="服务地点"
      subtitle="填写服务地点信息后保存"
    />
  );
}
