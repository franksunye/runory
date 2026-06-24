"use client";

import { useParams } from "next/navigation";
import ObjectCreatePage from "@/components/ObjectCreatePage";
import { segmentToObjectKey, useObjectLabel } from "@/lib/dynamic-object";

// v0.3.1: Dynamic object create route shell

export default function DynamicObjectCreatePage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const routeSegment = params.objectKey as string;

  const objectKey = segmentToObjectKey(routeSegment);
  const viewKey = `${objectKey}_form`;
  const basePath = `/w/${workspaceId}/${routeSegment}`;
  const title = useObjectLabel(workspaceId, routeSegment);

  return (
    <ObjectCreatePage
      objectKey={objectKey}
      viewKey={viewKey}
      basePath={basePath}
      title={title}
    />
  );
}
