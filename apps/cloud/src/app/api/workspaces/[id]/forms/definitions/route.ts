import { NextRequest } from "next/server";
import {
  publishFormDefinition,
  listFormDefinitions,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST: Create / publish a form definition (creates or bumps version).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(
      request,
      id,
      "member"
    );

    const body = (await request.json()) as {
      formKey: string;
      name: string;
      schema: { blocks: unknown[] };
      layout?: Record<string, unknown>;
    };

    if (!body?.formKey || !body?.name || !body?.schema) {
      return invalidInput(
        "formKey, name, and schema are required",
        ctx.requestId
      );
    }

    const userId = ctx.principal?.userId ?? "unknown";
    const result = await publishFormDefinition(
      workspaceId,
      {
        formKey: body.formKey,
        name: body.name,
        schema: body.schema as never,
        layout: body.layout,
      },
      userId
    );

    return successResponse(result, 201, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}

// GET: List form definitions (optional status filter).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(
      request,
      id,
      "viewer"
    );

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;

    const definitions = await listFormDefinitions(workspaceId, status);
    return successResponse(definitions, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
