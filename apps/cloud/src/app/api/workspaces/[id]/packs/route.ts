import { NextRequest } from "next/server";
import {
  listCatalogItems,
  getActiveReleaseForItem,
  loadPackManifest,
  getInstalledPacks,
  hasPackDemoData,
  type CatalogItem,
  type CatalogRelease,
  type CatalogVersion,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

interface PackSummary {
  packId: string;
  name: string;
  version: string;
  description: string | null;
  recommended: boolean;
  onboardingChecklist: Array<{
    id: string;
    label: string;
    route?: string;
    description?: string;
  }>;
  marketplace: { category: string; license: string; publisher: string } | null;
  demoDataAvailable: boolean;
  installed: boolean;
  updateAvailable: boolean;
  installation?: {
    packVersion: string;
    installedAt: string;
    demoDataStatus: "none" | "loaded" | "error";
    demoDataLoadedAt: string | null;
    installErrorMessage: string | null;
    demoDataErrorMessage: string | null;
  };
  release?: {
    channel: string;
    releasedAt: string;
  };
}

// GET /api/workspaces/[id]/packs — list all packs with metadata and installation status (v0.3.4)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    // Fetch catalog packs and installed packs in parallel
    const [catalogItems, installedPacks] = await Promise.all([
      listCatalogItems({ status: "active", itemType: "pack" }),
      getInstalledPacks(workspaceId),
    ]);

    const installedMap = new Map(installedPacks.map((p) => [p.packId, p]));

    const packs: PackSummary[] = [];
    for (const item of catalogItems) {
      const packId = item.name; // catalog item name = pack id
      let manifest;
      try {
        manifest = loadPackManifest(packId);
      } catch {
        continue; // skip packs whose manifest can't be loaded
      }

      const active = await getActiveReleaseForItem(item.id, "stable");
      const installation = installedMap.get(packId);

      packs.push({
        packId,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? null,
        recommended: manifest.recommended ?? false,
        onboardingChecklist: manifest.onboardingChecklist ?? [],
        marketplace: manifest.marketplace ?? null,
        demoDataAvailable: hasPackDemoData(packId),
        installed: !!installation,
        updateAvailable: !!installation && installation.packVersion !== manifest.version,
        installation: installation
          ? {
              packVersion: installation.packVersion,
              installedAt: installation.installedAt,
              demoDataStatus: installation.demoDataStatus,
              demoDataLoadedAt: installation.demoDataLoadedAt,
              installErrorMessage: installation.installErrorMessage,
              demoDataErrorMessage: installation.demoDataErrorMessage,
            }
          : undefined,
        release: active
          ? { channel: active.release.channel, releasedAt: active.release.releasedAt }
          : undefined,
      });
    }

    return successResponse(packs, 200, ctx.requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
