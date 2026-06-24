"use client";

import { useParams } from "next/navigation";
import ObjectDetailPage from "@/components/ObjectDetailPage";

export default function ContactDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectDetailPage
      objectKey="contact"
      viewKey="contact_form"
      basePath={`/w/${workspaceId}/contacts`}
      title="联系人"
      parentLinks={[
        {
          foreignKey: "primary_company_id",
          parentObjectKey: "company",
          label: "关联公司",
          titleField: "name",
          routeBase: "/w/{workspaceId}/companies",
        },
      ]}
    />
  );
}
