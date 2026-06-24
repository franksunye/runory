"use client";

import { useParams } from "next/navigation";
import ObjectCreatePage from "@/components/ObjectCreatePage";

export default function NewTaskPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  return (
    <ObjectCreatePage
      objectKey="task"
      viewKey="task_form"
      basePath={`/w/${workspaceId}/tasks`}
      title="任务"
      subtitle="填写任务信息后保存"
    />
  );
}
