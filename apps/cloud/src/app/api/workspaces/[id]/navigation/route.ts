import { NextRequest } from "next/server";
import {
  getNavigation,
  getInstallations,
  getInstalledPacks,
  loadPackManifest,
  type NavigationItem,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

interface InstalledPackGroup {
  packId: string;
  packName: string;
  category: string;
  installedAt: string;
}

interface NavigationResponse {
  items: NavigationItem[];
  packs: InstalledPackGroup[];
  modulePackMap: Record<string, string>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const [navigation, installations, packInstallations] = await Promise.all([
      getNavigation(workspaceId),
      getInstallations(workspaceId),
      getInstalledPacks(workspaceId),
    ]);

    // Build module → pack map from module-level installations
    const modulePackMap: Record<string, string> = {};
    for (const inst of installations) {
      if (inst.moduleId && inst.packId) {
        modulePackMap[inst.moduleId] = inst.packId;
      }
    }

    // Enrich pack installations with display names from manifests
    const packs: InstalledPackGroup[] = [];
    for (const pi of packInstallations) {
      try {
        const manifest = loadPackManifest(pi.packId);
        packs.push({
          packId: pi.packId,
          packName: manifest.name,
          category: manifest.marketplace?.category ?? "general",
          installedAt: pi.installedAt,
        });
      } catch {
        // Manifest not found — skip this pack in grouping
        packs.push({
          packId: pi.packId,
          packName: pi.packId,
          category: "general",
          installedAt: pi.installedAt,
        });
      }
    }

    const response: NavigationResponse = { items: navigation, packs, modulePackMap };
    return successResponse(response, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
