"use client";

import { useParams, useSearchParams } from "next/navigation";
import ObjectListPage from "@/components/ObjectListPage";
import { segmentToObjectKey, useObjectLabel } from "@/lib/dynamic-object";

// v0.3.1: Dynamic object route shell
// Official object pages are rendered from runtime metadata rather than
// per-object route wrappers.

export default function DynamicObjectListPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.workspaceId as string;
  const routeSegment = params.objectKey as string;

  const objectKey = segmentToObjectKey(routeSegment);
  // Default to the system list view; use the `view` URL param for custom views
  const viewParam = searchParams.get("view");
  const viewKey = viewParam ?? `${objectKey}_list`;
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
