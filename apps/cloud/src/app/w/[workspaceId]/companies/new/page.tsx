"use client";

import { useParams } from "next/navigation";
import ObjectCreatePage from "@/components/ObjectCreatePage";

export default function NewCompanyPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectCreatePage
      objectKey="company"
      viewKey="company_form"
      basePath={`/w/${workspaceId}/companies`}
      title="公司"
      subtitle="填写公司信息后保存"
    />
  );
}
