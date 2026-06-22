import { NextRequest } from "next/server";
import { z } from "zod";
import {
  promoteCatalogRelease,
  type ReleaseChannel,
} from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  successResponse,
  handleError,
  invalidInput,
  getOrCreateRequestId,
} from "@/lib/http";

export const dynamic = "force-dynamic";

const promoteSchema = z.object({
  channel: z.enum(["internal", "beta", "stable"]),
  releaseNotes: z.string().optional(),
});

// POST /api/platform/catalog/versions/[versionId]/promote — promote to channel
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { principal } = await requirePlatformAdmin(request);

    const { versionId } = await params;
    const body = (await request.json()) as {
      channel: ReleaseChannel;
      releaseNotes?: string;
    };
    const parsed = promoteSchema.safeParse(body);
    if (!parsed.success) {
      return invalidInput(parsed.error.message, requestId);
    }
    const release = await promoteCatalogRelease(principal, {
      catalogVersionId: versionId,
      channel: parsed.data.channel,
      releaseNotes: parsed.data.releaseNotes,
    });

    return successResponse(release, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
