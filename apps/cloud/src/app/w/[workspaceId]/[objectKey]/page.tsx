"use client";

import { useParams } from "next/navigation";
import ObjectListPage from "@/components/ObjectListPage";
import { segmentToObjectKey, useObjectLabel } from "@/lib/dynamic-object";

// v0.3.1: Dynamic object route shell
// Official object pages are rendered from runtime metadata rather than
// per-object route wrappers.

export default function DynamicObjectListPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const routeSegment = params.objectKey as string;

  const objectKey = segmentToObjectKey(routeSegment);
  const viewKey = `${objectKey}_list`;
  const basePath = `/w/${workspaceId}/${routeSegment}`;
  const title = useObjectLabel(workspaceId, routeSegment);

  return (
    <ObjectListPage
      objectKey={objectKey}
      viewKey={viewKey}
      basePath={basePath}
      title={title}
    />
  );
}
