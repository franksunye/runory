"use client";

import { useParams } from "next/navigation";
import ObjectCreatePage from "@/components/ObjectCreatePage";

export default function NewContactPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectCreatePage
      objectKey="contact"
      viewKey="contact_form"
      basePath={`/w/${workspaceId}/contacts`}
      title="联系人"
      subtitle="填写联系人信息后保存"
    />
  );
}
