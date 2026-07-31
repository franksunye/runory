import { NextRequest } from "next/server";
import {
  getRecord,
  hasBusinessPermission,
  resolveRecordCommands,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  notFound,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspaces/[id]/objects/[objectKey]/records/[recordId]/commands
 *
 * The Commands this record admits for this caller, derived from the Command
 * Contracts the Workspace was provisioned with. Surfaces render what they are
 * given rather than restating the state machine, so the office, the field app
 * and the portal cannot disagree with each other or with the runtime.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, objectKey, recordId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const record = await getRecord(workspaceId, objectKey, recordId);
    if (!record) {
      return notFound(`Record ${recordId} not found`, ctx.requestId);
    }

    const commands = await resolveRecordCommands(workspaceId, objectKey, record, {
      hasPermission: (permission) => hasBusinessPermission(ctx, permission),
    });
    return successResponse({ commands }, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
