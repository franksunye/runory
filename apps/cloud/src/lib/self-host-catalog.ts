import { readFile } from "node:fs/promises";
import {
  computeManifestChecksum, ConflictError, getActiveReleaseForItem,
  getCatalogItemByName, getCatalogVersion, getPackLock, loadModuleManifest,
  loadPackManifest, NotFoundError, parseModuleRef,
} from "@runory/platform-core";

// One bounded engineering profile. Cloud retains its existing catalog policy.
export const BUNDLED_FSM_PACKS = ["fsm-pack", "sales-quote-pack"] as const;

export function isSelfHostCandidate(): boolean {
  return process.env.RUNORY_SELF_HOST_CANDIDATE === "1";
}

function requireMatch(ok: boolean, label: string): asserts ok {
  if (!ok) throw new ConflictError("Bundled catalog mismatch: " + label);
}

function checksum(manifest: unknown): string {
  return computeManifestChecksum(manifest as Record<string, unknown>);
}

async function checkedRelease(type: "pack" | "module", id: string, manifest: { id: string; version: string }, commit: string) {
  const item = await getCatalogItemByName(id, type);
  const active = await getActiveReleaseForItem(item.id, "stable");
  requireMatch(active !== null, id + " has no active bundled release");
  const version = active.version;
  const digest = checksum(manifest);
  requireMatch(
    manifest.id === id && item.status === "active" &&
    version.lifecycleStatus === "ready" && version.version === manifest.version &&
    version.sourceCommit === commit && version.artifactChecksum === digest &&
    checksum(JSON.parse(version.manifestJson)) === digest,
    id + " version, source or manifest checksum",
  );
  return { item, version };
}

/** Verify the exact installed-source manifests against the candidate registry and
 * Pack lock before calling the existing installer. No second install/runtime path.
 * The surrounding HTTP route must first authorize the actual Workspace owner.
 */
export async function assertBundledPack(packId: string, commit?: string): Promise<void> {
  if (!BUNDLED_FSM_PACKS.some(id => id === packId)) {
    throw new NotFoundError("Pack is outside the supported self-hosted candidate catalog");
  }
  // A runtime-only upgrade preserves the frozen Catalog's actual source
  // identity. The marker is local, created offline after clone verification.
  if (!commit) {
    const runtime = process.env.RUNORY_RELEASE_COMMIT ?? "";
    const marker = JSON.parse(await readFile("/data/release.json", "utf8"));
    requireMatch(marker.sourceCommit === runtime, "volume release identity");
    requireMatch(["runory.self-host.volume/v1", "runory.self-host.volume/v2"].includes(marker.format), "volume marker format");
    commit = marker.format === "runory.self-host.volume/v2" ? String(marker.catalogSourceCommit ?? "") : runtime;
  }
  requireMatch(/^[a-f0-9]{40}$/.test(commit), "invalid release identity");
  const manifest = loadPackManifest(packId);
  const pack = await checkedRelease("pack", packId, manifest, commit);
  const locks = await getPackLock(pack.version.id);
  requireMatch(locks.length === manifest.modules.length, packId + " lock length");
  for (const [index, ref] of manifest.modules.entries()) {
    const { moduleId, range } = parseModuleRef(ref);
    const source = loadModuleManifest(moduleId);
    const active = await checkedRelease("module", moduleId, source, commit);
    const lock = locks[index];
    requireMatch(lock.resolutionOrder === index && lock.requestedRange === range &&
      lock.moduleItemId === active.item.id && lock.resolvedModuleVersionId === active.version.id &&
      lock.artifactChecksum === active.version.artifactChecksum, packId + " lock for " + moduleId);
    const locked = await getCatalogVersion(lock.resolvedModuleVersionId);
    requireMatch(locked.catalogItemId === active.item.id && locked.version === source.version, moduleId + " locked version");
  }
}
