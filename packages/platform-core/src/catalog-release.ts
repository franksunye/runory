import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import {
  type Principal,
  ConflictError,
  NotFoundError,
  InvalidInputError,
} from "./context";
import { writeAuditEvent } from "./audit-service";
import {
  getCatalogVersion,
  getCatalogItemByName,
  listCatalogVersions,
  requirePlatformRole,
  parseManifest,
  type CatalogVersion,
} from "./catalog-registry";
import { type PackManifest } from "@runory/contracts";
import { satisfies as semverSatisfies, compare as semverCompare } from "semver";

// ── Types ──

export type ReleaseChannel = "internal" | "beta" | "stable";
export type ReleaseStatus = "active" | "superseded" | "paused" | "withdrawn";

export interface CatalogRelease {
  id: string;
  catalogVersionId: string;
  channel: ReleaseChannel;
  status: ReleaseStatus;
  releaseNotes: string | null;
  approvedBy: string | null;
  releasedAt: string;
  createdAt: string;
}

export interface PackVersionLock {
  id: string;
  packCatalogVersionId: string;
  moduleItemId: string;
  requestedRange: string;
  resolvedModuleVersionId: string;
  artifactChecksum: string | null;
  resolutionOrder: number;
  createdAt: string;
}

// ── DB Row Types (snake_case) ──

interface CatalogReleaseRow {
  id: string;
  catalog_version_id: string;
  channel: string;
  status: string;
  release_notes: string | null;
  approved_by: string | null;
  released_at: string;
  created_at: string;
}

interface PackVersionLockRow {
  id: string;
  pack_catalog_version_id: string;
  module_item_id: string;
  requested_range: string;
  resolved_module_version_id: string;
  artifact_checksum: string | null;
  resolution_order: number;
  created_at: string;
}

// ── Row → Object Mappers ──

function mapCatalogRelease(row: CatalogReleaseRow): CatalogRelease {
  return {
    id: row.id,
    catalogVersionId: row.catalog_version_id,
    channel: row.channel as ReleaseChannel,
    status: row.status as ReleaseStatus,
    releaseNotes: row.release_notes,
    approvedBy: row.approved_by,
    releasedAt: row.released_at,
    createdAt: row.created_at,
  };
}

function mapPackVersionLock(row: PackVersionLockRow): PackVersionLock {
  return {
    id: row.id,
    packCatalogVersionId: row.pack_catalog_version_id,
    moduleItemId: row.module_item_id,
    requestedRange: row.requested_range,
    resolvedModuleVersionId: row.resolved_module_version_id,
    artifactChecksum: row.artifact_checksum,
    resolutionOrder: row.resolution_order,
    createdAt: row.created_at,
  };
}

// ── Helper: Parse Module Ref ──
//
// Format: `moduleId:range` (e.g., `runory.customer:^1.0.0`)
// If no `:`, default range to `*`.

export function parseModuleRef(ref: string): { moduleId: string; range: string } {
  const colonIndex = ref.indexOf(":");
  if (colonIndex === -1) {
    return { moduleId: ref, range: "*" };
  }
  return {
    moduleId: ref.substring(0, colonIndex),
    range: ref.substring(colonIndex + 1),
  };
}

// ── Promote Catalog Release (docs/09 §11) ──

export async function promoteCatalogRelease(
  principal: Principal,
  params: {
    catalogVersionId: string;
    channel: ReleaseChannel;
    releaseNotes?: string;
  }
): Promise<CatalogRelease> {
  requirePlatformRole(principal, "release_manager");

  const version = await getCatalogVersion(params.catalogVersionId);
  if (version.lifecycleStatus !== "ready") {
    throw new ConflictError(
      `Version ${params.catalogVersionId} must be in 'ready' status to promote (current: ${version.lifecycleStatus})`
    );
  }

  // Channel promotion guards (docs/09 §11)
  if (params.channel === "beta") {
    const internalRelease = await getActiveRelease(params.catalogVersionId, "internal");
    if (!internalRelease) {
      throw new ConflictError(
        `Cannot promote to beta: no active internal release for version ${params.catalogVersionId}`
      );
    }
  } else if (params.channel === "stable") {
    const betaRelease = await getActiveRelease(params.catalogVersionId, "beta");
    if (!betaRelease) {
      throw new ConflictError(
        `Cannot promote to stable: no active beta release for version ${params.catalogVersionId}`
      );
    }
  }

  // Check UNIQUE(catalog_version_id, channel) — if already active, conflict
  const existing = await queryOne<CatalogReleaseRow>(
    `SELECT * FROM ${TABLES.catalogReleases} WHERE catalog_version_id = ? AND channel = ?`,
    [params.catalogVersionId, params.channel]
  );
  if (existing && existing.status === "active") {
    throw new ConflictError(
      `Release already exists and is active for version ${params.catalogVersionId} on channel ${params.channel}`
    );
  }

  // Supersede any previous active release for the same item + channel
  const previousActive = await queryOne<CatalogReleaseRow>(
    `SELECT r.* FROM ${TABLES.catalogReleases} r
     JOIN ${TABLES.catalogVersions} v ON r.catalog_version_id = v.id
     WHERE v.catalog_item_id = ? AND r.channel = ? AND r.status = 'active'
       AND r.catalog_version_id != ?`,
    [version.catalogItemId, params.channel, params.catalogVersionId]
  );
  if (previousActive) {
    await execute(
      `UPDATE ${TABLES.catalogReleases} SET status = 'superseded' WHERE id = ?`,
      [previousActive.id]
    );
  }

  const releaseId = existing ? existing.id : genId("rel");
  const ts = now();

  if (existing) {
    // Re-promotion: update the existing non-active row back to active
    await execute(
      `UPDATE ${TABLES.catalogReleases}
       SET status = 'active', release_notes = ?, approved_by = ?, released_at = ?
       WHERE id = ?`,
      [params.releaseNotes ?? null, principal.userId, ts, releaseId]
    );
  } else {
    await execute(
      `INSERT INTO ${TABLES.catalogReleases}
       (id, catalog_version_id, channel, status, release_notes, approved_by, released_at, created_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
      [
        releaseId,
        params.catalogVersionId,
        params.channel,
        params.releaseNotes ?? null,
        principal.userId,
        ts,
        ts,
      ]
    );
  }

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.release_promote",
    entityType: "catalog_release",
    entityId: releaseId,
    after: {
      catalogVersionId: params.catalogVersionId,
      channel: params.channel,
      status: "active",
      releaseNotes: params.releaseNotes ?? null,
      approvedBy: principal.userId,
    },
  });

  return getRelease(releaseId);
}

// ── Deprecate Catalog Version (docs/09 §13) ──

export async function deprecateCatalogVersion(
  principal: Principal,
  versionId: string,
  reason: string
): Promise<void> {
  requirePlatformRole(principal, "release_manager");

  const version = await getCatalogVersion(versionId);
  if (version.lifecycleStatus !== "ready") {
    throw new ConflictError(
      `Version ${versionId} must be in 'ready' status to deprecate (current: ${version.lifecycleStatus})`
    );
  }

  const previousStatus = version.lifecycleStatus;
  await execute(
    `UPDATE ${TABLES.catalogVersions} SET lifecycle_status = 'deprecated' WHERE id = ?`,
    [versionId]
  );

  // Supersede all active releases for this version
  await execute(
    `UPDATE ${TABLES.catalogReleases} SET status = 'superseded' WHERE catalog_version_id = ? AND status = 'active'`,
    [versionId]
  );

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.release_deprecate",
    entityType: "catalog_version",
    entityId: versionId,
    before: { lifecycleStatus: previousStatus },
    after: { lifecycleStatus: "deprecated", reason },
  });
}

// ── Withdraw Catalog Version (docs/09 §13) ──

export async function withdrawCatalogVersion(
  principal: Principal,
  versionId: string,
  reason: string
): Promise<void> {
  requirePlatformRole(principal, "security_manager");

  const version = await getCatalogVersion(versionId);
  if (
    version.lifecycleStatus !== "ready" &&
    version.lifecycleStatus !== "deprecated"
  ) {
    throw new ConflictError(
      `Version ${versionId} must be in 'ready' or 'deprecated' status to withdraw (current: ${version.lifecycleStatus})`
    );
  }

  const previousStatus = version.lifecycleStatus;
  await execute(
    `UPDATE ${TABLES.catalogVersions} SET lifecycle_status = 'withdrawn' WHERE id = ?`,
    [versionId]
  );

  // Withdraw all active releases for this version
  await execute(
    `UPDATE ${TABLES.catalogReleases} SET status = 'withdrawn' WHERE catalog_version_id = ? AND status = 'active'`,
    [versionId]
  );

  // Pause all running rollouts for this version's releases
  await execute(
    `UPDATE ${TABLES.releaseRollouts} SET status = 'paused'
     WHERE catalog_release_id IN (
       SELECT id FROM ${TABLES.catalogReleases} WHERE catalog_version_id = ?
     ) AND status = 'running'`,
    [versionId]
  );

  // High-risk audit event
  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.release_withdraw",
    entityType: "catalog_version",
    entityId: versionId,
    before: { lifecycleStatus: previousStatus },
    after: { lifecycleStatus: "withdrawn", reason, risk: "high" },
  });
}

// ── Get Release ──

export async function getRelease(releaseId: string): Promise<CatalogRelease> {
  const row = await queryOne<CatalogReleaseRow>(
    `SELECT * FROM ${TABLES.catalogReleases} WHERE id = ?`,
    [releaseId]
  );
  if (!row) throw new NotFoundError(`Release not found: ${releaseId}`);
  return mapCatalogRelease(row);
}

export async function getActiveRelease(
  catalogVersionId: string,
  channel: ReleaseChannel
): Promise<CatalogRelease | null> {
  const row = await queryOne<CatalogReleaseRow>(
    `SELECT * FROM ${TABLES.catalogReleases}
     WHERE catalog_version_id = ? AND channel = ? AND status = 'active'`,
    [catalogVersionId, channel]
  );
  return row ? mapCatalogRelease(row) : null;
}

// ── List Releases ──

export async function listReleases(options?: {
  channel?: ReleaseChannel;
  status?: ReleaseStatus;
  catalogVersionId?: string;
}): Promise<CatalogRelease[]> {
  const conditions: string[] = [];
  const args: unknown[] = [];
  if (options?.channel) {
    conditions.push("channel = ?");
    args.push(options.channel);
  }
  if (options?.status) {
    conditions.push("status = ?");
    args.push(options.status);
  }
  if (options?.catalogVersionId) {
    conditions.push("catalog_version_id = ?");
    args.push(options.catalogVersionId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await queryAll<CatalogReleaseRow>(
    `SELECT * FROM ${TABLES.catalogReleases} ${where} ORDER BY released_at DESC`,
    args
  );
  return rows.map(mapCatalogRelease);
}

// ── Get Active Release for Item ──
//
// Find the latest active release for a catalog item in a channel.
// Joins catalog_releases with catalog_versions on catalog_version_id.

export async function getActiveReleaseForItem(
  catalogItemId: string,
  channel: ReleaseChannel
): Promise<{ release: CatalogRelease; version: CatalogVersion } | null> {
  const row = await queryOne<CatalogReleaseRow>(
    `SELECT r.* FROM ${TABLES.catalogReleases} r
     JOIN ${TABLES.catalogVersions} v ON r.catalog_version_id = v.id
     WHERE v.catalog_item_id = ? AND r.channel = ? AND r.status = 'active'
     ORDER BY r.released_at DESC
     LIMIT 1`,
    [catalogItemId, channel]
  );
  if (!row) return null;
  const release = mapCatalogRelease(row);
  const version = await getCatalogVersion(release.catalogVersionId);
  return { release, version };
}

// ── Resolve Pack Dependencies and Generate Lock (docs/09 §7.2, §20 CR2) ──

export async function resolvePackLock(
  principal: Principal,
  packVersionId: string
): Promise<PackVersionLock[]> {
  requirePlatformRole(principal, "catalog_editor");

  const packVersion = await getCatalogVersion(packVersionId);
  const manifest = parseManifest(packVersion.manifestJson, "pack") as PackManifest;

  // Resolve each module ref in the pack manifest
  const resolvedLocks: Array<{
    moduleItemId: string;
    requestedRange: string;
    resolvedModuleVersionId: string;
    artifactChecksum: string | null;
    resolutionOrder: number;
  }> = [];

  for (let i = 0; i < manifest.modules.length; i++) {
    const ref = manifest.modules[i];
    const { moduleId, range } = parseModuleRef(ref);

    // Find the catalog item by name (module ID) and type 'module'
    const moduleItem = await getCatalogItemByName(moduleId, "module");

    // Find the latest 'ready' version of that module that satisfies the range
    const readyVersions = await listCatalogVersions(moduleItem.id, {
      lifecycleStatus: "ready",
    });

    const satisfying = readyVersions.filter((v) =>
      semverSatisfies(v.version, range)
    );

    if (satisfying.length === 0) {
      throw new InvalidInputError(
        `No ready version of module '${moduleId}' satisfies range '${range}'`
      );
    }

    // Sort descending by semver to pick the latest
    satisfying.sort((a, b) => semverCompare(b.version, a.version));
    const resolved = satisfying[0];

    resolvedLocks.push({
      moduleItemId: moduleItem.id,
      requestedRange: range,
      resolvedModuleVersionId: resolved.id,
      artifactChecksum: resolved.artifactChecksum,
      resolutionOrder: i,
    });
  }

  // Delete any existing locks for this pack version (re-resolution replaces)
  await execute(
    `DELETE FROM ${TABLES.packVersionLocks} WHERE pack_catalog_version_id = ?`,
    [packVersionId]
  );

  // Insert new lock rows
  const ts = now();
  const locks: PackVersionLock[] = [];
  for (const resolved of resolvedLocks) {
    const lockId = genId("lock");
    await execute(
      `INSERT INTO ${TABLES.packVersionLocks}
       (id, pack_catalog_version_id, module_item_id, requested_range,
        resolved_module_version_id, artifact_checksum, resolution_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lockId,
        packVersionId,
        resolved.moduleItemId,
        resolved.requestedRange,
        resolved.resolvedModuleVersionId,
        resolved.artifactChecksum,
        resolved.resolutionOrder,
        ts,
      ]
    );
    locks.push({
      id: lockId,
      packCatalogVersionId: packVersionId,
      moduleItemId: resolved.moduleItemId,
      requestedRange: resolved.requestedRange,
      resolvedModuleVersionId: resolved.resolvedModuleVersionId,
      artifactChecksum: resolved.artifactChecksum,
      resolutionOrder: resolved.resolutionOrder,
      createdAt: ts,
    });
  }

  return locks;
}

// ── Get Pack Lock ──

export async function getPackLock(packVersionId: string): Promise<PackVersionLock[]> {
  const rows = await queryAll<PackVersionLockRow>(
    `SELECT * FROM ${TABLES.packVersionLocks}
     WHERE pack_catalog_version_id = ?
     ORDER BY resolution_order ASC`,
    [packVersionId]
  );
  return rows.map(mapPackVersionLock);
}
