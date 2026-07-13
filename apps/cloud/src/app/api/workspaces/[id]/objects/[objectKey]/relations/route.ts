import { NextRequest } from "next/server";
import { getRelations, getBacklinks, loadModuleManifest, type RelationDefinition } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

function enrichRelationPresentation(relation: RelationDefinition): RelationDefinition {
  try {
    const declaration = loadModuleManifest(relation.moduleId).relations?.find((candidate) =>
      candidate.object === relation.objectKey
      && candidate.targetObject === relation.targetObjectKey
      && candidate.foreignKey === relation.foreignKey
    );
    if (!declaration) return relation;
    return {
      ...relation,
      ...(declaration.composition ? { composition: declaration.composition } : {}),
      ...(declaration.backlinkPresentation
        ? { backlinkPresentation: declaration.backlinkPresentation }
        : {}),
    };
  } catch {
    return relation;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    const [relations, backlinks] = await Promise.all([
      getRelations(workspaceId, objectKey),
      getBacklinks(workspaceId, objectKey),
    ]);
    return successResponse({
      relations: relations.map(enrichRelationPresentation),
      backlinks: backlinks.map(enrichRelationPresentation),
    }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
