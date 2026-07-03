import { NextRequest } from "next/server";
import {
  getNavigation,
  getInstallations,
  getInstalledPacks,
  loadPackManifest,
  loadModuleManifest,
  type NavigationItem,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId, METADATA_CACHE } from "@/lib/http";

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
  modulePresentation: Record<string, { visibility: string; surface?: string; audience?: string[] }>;
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

    // Build module → presentation map from module manifests so the client can
    // filter navigation items by visibility / audience metadata (e.g. hide
    // contextual objects like service_visit/report, and hidden objects like
    // quote-approval, from the top-level sidebar).
    const modulePresentation: Record<string, { visibility: string; surface?: string; audience?: string[] }> = {};
    for (const inst of installations) {
      if (inst.moduleId) {
        try {
          const manifest = loadModuleManifest(inst.moduleId);
          if (manifest.presentation) {
            modulePresentation[inst.moduleId] = manifest.presentation;
          }
        } catch {
          // Manifest not found — skip
        }
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

    const response: NavigationResponse = { items: navigation, packs, modulePackMap, modulePresentation };
    return successResponse(response, 200, ctx.requestId, METADATA_CACHE);
  } catch (e) {
    return handleError(e, requestId);
  }
}
