import { NextRequest } from "next/server";
import { loadPackManifest, getInstalledPacks, hasPackDemoData, uninstallPack } from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[id]/packs/[packId]
// Returns pack detail including installation status and demo data status (v0.3.4).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, packId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const manifest = loadPackManifest(packId);
    const installedPacks = await getInstalledPacks(workspaceId);
    const installation = installedPacks.find((p) => p.packId === packId);

    return successResponse(
      {
        pack: {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description ?? null,
          recommended: manifest.recommended ?? false,
          onboardingChecklist: manifest.onboardingChecklist ?? [],
          modules: manifest.modules,
          marketplace: manifest.marketplace ?? null,
        },
        installation: installation
          ? {
              installed: true,
              packVersion: installation.packVersion,
              installedAt: installation.installedAt,
              demoDataStatus: installation.demoDataStatus,
              demoDataLoadedAt: installation.demoDataLoadedAt,
              installErrorMessage: installation.installErrorMessage,
              demoDataErrorMessage: installation.demoDataErrorMessage,
              updateAvailable: installation.packVersion !== manifest.version,
            }
          : { installed: false },
        demoDataAvailable: hasPackDemoData(packId),
      },
      200,
      ctx.requestId
    );
  } catch (e) {
    return handleError(e, requestId);
  }
}

// DELETE /api/workspaces/[id]/packs/[packId]
// Uninstall a pack. Exclusively-owned module tables are dropped; shared
// modules (used by another installed pack) are kept. Requires admin role.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, packId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "admin");

    const result = await uninstallPack(workspaceId, packId);

    return successResponse(result, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
