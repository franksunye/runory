import { NextRequest } from "next/server";
import {
  getNavigation,
  getInstallations,
  getInstalledPacks,
  loadPackManifest,
  loadModuleManifest,
  getVisibilitySummary,
  resolveWorkspaceSurfaces,
  type NavigationItem,
} from "@runory/platform-core";
import type { PackManifest, WorkspaceSurfaceKey } from "@runory/contracts";
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
  modulePresentation: Record<string, { visibility: string; surface?: string; audience?: string[] }>;
  platformSurfaces: WorkspaceSurfaceKey[];
  canManage: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");

    const [navigation, installations, packInstallations, accessSummary] = await Promise.all([
      getNavigation(workspaceId),
      getInstallations(workspaceId),
      getInstalledPacks(workspaceId),
      ctx.principal
        ? getVisibilitySummary(workspaceId, {
            userId: ctx.principal.userId,
            role: ctx.workspaceRole,
            organizationRole: ctx.organizationRole,
          })
        : Promise.resolve(null),
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
    const contextualRoutes = new Set<string>();
    for (const inst of installations) {
      if (inst.moduleId) {
        try {
          const manifest = loadModuleManifest(inst.moduleId);
          if (manifest.presentation) {
            modulePresentation[inst.moduleId] = manifest.presentation;
          }
          for (const item of manifest.ui?.navigation ?? []) {
            if (item.contextual) contextualRoutes.add(item.route);
          }
        } catch {
          // Manifest not found — skip
        }
      }
    }

    // Enrich pack installations with display names from manifests
    const packs: InstalledPackGroup[] = [];
    const installedPackManifests: PackManifest[] = [];
    for (const pi of packInstallations) {
      try {
        const manifest = loadPackManifest(pi.packId);
        installedPackManifests.push(manifest);
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

    const audienceKeys = new Set(accessSummary?.permissionGroups.map((group) => group.groupKey) ?? []);
    const visibleNavigation = navigation.filter((item) => {
      if (contextualRoutes.has(item.route)) return false;
      if (ctx.workspaceRole !== "admin") {
          const audience = item.moduleId ? modulePresentation[item.moduleId]?.audience : undefined;
          return !audience?.length || audience.some((groupKey) => audienceKeys.has(groupKey));
      }
      return true;
    });
    const platformSurfaces = resolveWorkspaceSurfaces(installedPackManifests, {
      administrator: ctx.workspaceRole === "admin",
      audienceAssignments: accessSummary?.permissionGroups ?? [],
    });
    const response: NavigationResponse = {
      items: visibleNavigation,
      packs,
      modulePackMap,
      modulePresentation,
      platformSurfaces,
      canManage: ctx.workspaceRole === "admin",
    };
    // Navigation is identity-specific: do not let a previous persona's menu survive a switch.
    return successResponse(response, 200, ctx.requestId, "no-store");
  } catch (e) {
    return handleError(e, requestId);
  }
}
