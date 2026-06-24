"use client";

import { useParams } from "next/navigation";
import ObjectListPage from "@/components/ObjectListPage";

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "创建时间（最新）" },
  { value: "created_at:asc", label: "创建时间（最早）" },
  { value: "name:asc", label: "姓名（A-Z）" },
  { value: "name:desc", label: "姓名（Z-A）" },
  { value: "email:asc", label: "邮箱（A-Z）" },
];

export default function ContactListPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectListPage
      objectKey="contact"
      viewKey="contact_list"
      basePath={`/w/${workspaceId}/contacts`}
      title="联系人"
      subtitle="管理所有联系人记录"
      searchPlaceholder="搜索姓名、邮箱、电话、角色..."
      sortOptions={SORT_OPTIONS}
      createLabel="添加联系人"
      packName="CRM Lite Pack"
    />
  );
}
