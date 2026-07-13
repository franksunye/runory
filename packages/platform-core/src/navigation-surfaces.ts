import type { PackManifest, WorkspaceSurfaceKey } from "@runory/contracts";

export interface WorkspaceSurfaceResolutionOptions {
  audienceAssignments?: Iterable<{ packId: string; groupKey: string }>;
  administrator?: boolean;
}

/**
 * Resolve platform-owned workspace surfaces from installed Pack manifests.
 *
 * A surface is visible when at least one installed Pack contributes it and the
 * current user belongs to one of that contribution's audiences. Contributions
 * without an audience are workspace-wide. Administrators can inspect every
 * installed capability. Data authorization remains enforced independently by
 * each surface API.
 */
export function resolveWorkspaceSurfaces(
  installedPacks: PackManifest[],
  options: WorkspaceSurfaceResolutionOptions = {}
): WorkspaceSurfaceKey[] {
  const audienceAssignments = new Set(
    [...(options.audienceAssignments ?? [])].map(({ packId, groupKey }) => `${packId}:${groupKey}`)
  );
  const resolved = new Set<WorkspaceSurfaceKey>();

  for (const pack of installedPacks) {
    for (const contribution of pack.workspaceSurfaces ?? []) {
      const allowed = options.administrator
        || !contribution.audience?.length
        || contribution.audience.some((audience) => audienceAssignments.has(`${pack.id}:${audience}`));
      if (allowed) resolved.add(contribution.key);
    }
  }

  const productOrder: WorkspaceSurfaceKey[] = ["my_work", "planning", "activity"];
  return productOrder.filter((key) => resolved.has(key));
}
