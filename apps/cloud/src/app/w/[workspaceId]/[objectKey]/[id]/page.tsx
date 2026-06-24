"use client";

import { useParams } from "next/navigation";
import ObjectDetailPage from "@/components/ObjectDetailPage";
import { segmentToObjectKey, useObjectLabel } from "@/lib/dynamic-object";

// v0.3.1: Dynamic object detail route shell

export default function DynamicObjectDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const routeSegment = params.objectKey as string;

  const objectKey = segmentToObjectKey(routeSegment);
  const viewKey = `${objectKey}_form`;
  const basePath = `/w/${workspaceId}/${routeSegment}`;
  const title = useObjectLabel(workspaceId, routeSegment);

  return (
    <ObjectDetailPage
      objectKey={objectKey}
      viewKey={viewKey}
      basePath={basePath}
      title={title}
    />
  );
}
