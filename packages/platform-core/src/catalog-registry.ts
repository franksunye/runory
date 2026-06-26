import { createHash } from "node:crypto";
import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import {
  type Principal,
  type PlatformRole,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InvalidInputError,
} from "./context";
import { writeAuditEvent } from "./audit-service";
import { isPlatformAdmin } from "./platform-config";
import {
  loadModuleManifest,
  loadPackManifest,
  loadTemplateManifest,
} from "./installer";
import {
  moduleManifestSchema,
  packManifestSchema,
  templateManifestSchema,
  type ModuleManifest,
  type PackManifest,
  type TemplateManifest,
} from "@runory/contracts";

// ── Types ──

export type CatalogItemType = "module" | "pack" | "template";
export type VersionLifecycleStatus =
  | "draft"
  | "validating"
  | "rejected"
  | "ready"
  | "deprecated"
  | "withdrawn";

export interface CatalogItem {
  id: string;
  itemType: CatalogItemType;
  name: string;
  description: string | null;
  publisherId: string;
  visibility: "internal" | "public";
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface CatalogVersion {
  id: string;
  catalogItemId: string;
  version: string;
  lifecycleStatus: VersionLifecycleStatus;
  manifestJson: string;
  manifestSchemaVersion: string;
  artifactUri: string | null;
  artifactChecksum: string | null;
  sourceRepository: string | null;
  sourceCommit: string | null;
  buildId: string | null;
  createdBy: string;
  frozenAt: string | null;
  createdAt: string;
}

// ── DB Row Types (snake_case) ──

interface CatalogItemRow {
  id: string;
  item_type: string;
  name: string;
  description: string | null;
  publisher_id: string;
  visibility: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CatalogVersionRow {
  id: string;
  catalog_item_id: string;
  version: string;
  lifecycle_status: string;
  manifest_json: string;
  manifest_schema_version: string;
  artifact_uri: string | null;
  artifact_checksum: string | null;
  source_repository: string | null;
  source_commit: string | null;
  build_id: string | null;
  created_by: string;
  frozen_at: string | null;
  created_at: string;
}

// ── Row → Object Mappers ──

function mapCatalogItem(row: CatalogItemRow): CatalogItem {
  return {
    id: row.id,
    itemType: row.item_type as CatalogItemType,
    name: row.name,
    description: row.description,
    publisherId: row.publisher_id,
    visibility: row.visibility as "internal" | "public",
    status: row.status as "active" | "archived",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCatalogVersion(row: CatalogVersionRow): CatalogVersion {
  return {
    id: row.id,
    catalogItemId: row.catalog_item_id,
    version: row.version,
    lifecycleStatus: row.lifecycle_status as VersionLifecycleStatus,
    manifestJson: row.manifest_json,
    manifestSchemaVersion: row.manifest_schema_version,
    artifactUri: row.artifact_uri,
    artifactChecksum: row.artifact_checksum,
    sourceRepository: row.source_repository,
    sourceCommit: row.source_commit,
    buildId: row.build_id,
    createdBy: row.created_by,
    frozenAt: row.frozen_at,
    createdAt: row.created_at,
  };
}

// ── Platform Role Guard ──
//
// POC simplification: platform admins (env allowlist) have all platform roles.
// A proper RBAC store would map principals to individual platform roles.

export function requirePlatformRole(principal: Principal, role: PlatformRole): void {
  if (isPlatformAdmin(principal.email)) {
    return;
  }
  // Dev bootstrap: grant all platform roles in local development only.
  // Gated on the explicit PLATFORM_DEV_BOOTSTRAP flag (not NODE_ENV) so this
  // never activates in staging or production. Lets the local dev owner seed
  // the catalog and exercise the full publish pipeline without an admin session.
  if (process.env.PLATFORM_DEV_BOOTSTRAP === "true" && principal.authMethod === "dev_bootstrap") {
    return;
  }
  throw new AuthorizationError(`Principal does not have platform role: ${role}`);
}

// ── Manifest Helpers ──

function validateManifest(
  manifest: unknown,
  itemType: CatalogItemType
): ModuleManifest | PackManifest | TemplateManifest {
  const schema =
    itemType === "module"
      ? moduleManifestSchema
      : itemType === "pack"
        ? packManifestSchema
        : templateManifestSchema;
  try {
    return schema.parse(manifest);
  } catch (e) {
    throw new InvalidInputError(`Manifest validation failed: ${(e as Error).message}`);
  }
}

export function parseManifest(
  json: string,
  itemType: CatalogItemType
): ModuleManifest | PackManifest | TemplateManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new InvalidInputError("Manifest is not valid JSON");
  }
  return validateManifest(raw, itemType);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function computeManifestChecksum(manifest: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeysDeep(manifest));
  return createHash("sha256").update(canonical).digest("hex");
}

// ── Import Catalog Candidate (docs/09 §6, §20 CR0) ──

export async function importCatalogCandidate(
  principal: Principal,
  params: {
    itemType: CatalogItemType;
    itemId: string;
    version: string;
    manifest: Record<string, unknown>;
    artifactUri?: string;
    artifactChecksum?: string;
    sourceRepository?: string;
    sourceCommit?: string;
    buildId?: string;
  }
): Promise<{ catalogItemId: string; catalogVersionId: string }> {
  requirePlatformRole(principal, "catalog_editor");

  // Validate manifest against the appropriate schema
  const validated = validateManifest(params.manifest, params.itemType);
  const manifestSchemaVersion = validated.manifestSchemaVersion;
  const manifestJson = JSON.stringify(params.manifest);

  // Get or create catalog_items row (by item_type + name)
  const existingItem = await queryOne<CatalogItemRow>(
    `SELECT * FROM ${TABLES.catalogItems} WHERE item_type = ? AND name = ?`,
    [params.itemType, params.itemId]
  );

  let catalogItemId: string;
  if (existingItem) {
    catalogItemId = existingItem.id;
  } else {
    catalogItemId = genId("cat");
    const ts = now();
    try {
      await execute(
        `INSERT INTO ${TABLES.catalogItems}
         (id, item_type, name, description, publisher_id, visibility, status, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, 'internal', 'active', ?, ?)`,
        [catalogItemId, params.itemType, params.itemId, principal.userId, ts, ts]
      );
    } catch (err) {
      // Concurrent import — another caller inserted the same item between
      // our SELECT and INSERT. Fall back to the existing row.
      if (err instanceof Error && err.message.includes("UNIQUE")) {
        const concurrent = await queryOne<CatalogItemRow>(
          `SELECT * FROM ${TABLES.catalogItems} WHERE item_type = ? AND name = ?`,
          [params.itemType, params.itemId]
        );
        if (concurrent) {
          catalogItemId = concurrent.id;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  // Check UNIQUE(catalog_item_id, version)
  const existingVersion = await queryOne<CatalogVersionRow>(
    `SELECT * FROM ${TABLES.catalogVersions} WHERE catalog_item_id = ? AND version = ?`,
    [catalogItemId, params.version]
  );

  let catalogVersionId: string;
  if (existingVersion) {
    const existingStatus = existingVersion.lifecycle_status as VersionLifecycleStatus;
    if (existingStatus !== "draft" && existingStatus !== "rejected") {
      throw new ConflictError(
        `Version ${params.version} already exists with lifecycle status: ${existingStatus}`
      );
    }
    // Overwrite the existing draft/rejected version
    catalogVersionId = existingVersion.id;
    await execute(
      `UPDATE ${TABLES.catalogVersions}
       SET lifecycle_status = 'draft',
           manifest_json = ?,
           manifest_schema_version = ?,
           artifact_uri = ?,
           artifact_checksum = ?,
           source_repository = ?,
           source_commit = ?,
           build_id = ?,
           frozen_at = NULL
       WHERE id = ?`,
      [
        manifestJson,
        manifestSchemaVersion,
        params.artifactUri ?? null,
        params.artifactChecksum ?? null,
        params.sourceRepository ?? null,
        params.sourceCommit ?? null,
        params.buildId ?? null,
        catalogVersionId,
      ]
    );
  } else {
    catalogVersionId = genId("cver");
    const ts = now();
    await execute(
      `INSERT INTO ${TABLES.catalogVersions}
       (id, catalog_item_id, version, lifecycle_status, manifest_json, manifest_schema_version,
        artifact_uri, artifact_checksum, source_repository, source_commit, build_id,
        created_by, frozen_at, created_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        catalogVersionId,
        catalogItemId,
        params.version,
        manifestJson,
        manifestSchemaVersion,
        params.artifactUri ?? null,
        params.artifactChecksum ?? null,
        params.sourceRepository ?? null,
        params.sourceCommit ?? null,
        params.buildId ?? null,
        principal.userId,
        ts,
      ]
    );
  }

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.candidate_import",
    entityType: "catalog_version",
    entityId: catalogVersionId,
    after: {
      catalogItemId,
      catalogVersionId,
      itemType: params.itemType,
      name: params.itemId,
      version: params.version,
    },
  });

  return { catalogItemId, catalogVersionId };
}

// ── Import from Development Catalog (docs/09 §20 CR0 exit criteria) ──
//
// Development import adapter: loads manifests from the repo catalog/ directory
// via the existing POC loaders and imports them into the Registry.

export async function importFromDevCatalog(
  principal: Principal,
  itemId: string,
  itemType: CatalogItemType
): Promise<{ catalogItemId: string; catalogVersionId: string }> {
  let manifest: ModuleManifest | PackManifest | TemplateManifest;
  if (itemType === "module") {
    manifest = loadModuleManifest(itemId);
  } else if (itemType === "pack") {
    manifest = loadPackManifest(itemId);
  } else {
    manifest = loadTemplateManifest(itemId);
  }

  const manifestRecord = manifest as unknown as Record<string, unknown>;
  const artifactChecksum = computeManifestChecksum(manifestRecord);

  return importCatalogCandidate(principal, {
    itemType,
    itemId: manifest.id,
    version: manifest.version,
    manifest: manifestRecord,
    artifactChecksum,
  });
}

// ── Get Catalog Item ──

export async function getCatalogItem(itemId: string): Promise<CatalogItem> {
  const row = await queryOne<CatalogItemRow>(
    `SELECT * FROM ${TABLES.catalogItems} WHERE id = ?`,
    [itemId]
  );
  if (!row) throw new NotFoundError(`Catalog item not found: ${itemId}`);
  return mapCatalogItem(row);
}

export async function getCatalogItemByName(
  name: string,
  itemType: CatalogItemType
): Promise<CatalogItem> {
  const row = await queryOne<CatalogItemRow>(
    `SELECT * FROM ${TABLES.catalogItems} WHERE name = ? AND item_type = ?`,
    [name, itemType]
  );
  if (!row) {
    throw new NotFoundError(`Catalog item not found: ${name} (${itemType})`);
  }
  return mapCatalogItem(row);
}

// ── List Catalog Items ──

export async function listCatalogItems(options?: {
  itemType?: CatalogItemType;
  status?: "active" | "archived";
}): Promise<CatalogItem[]> {
  const conditions: string[] = [];
  const args: unknown[] = [];
  if (options?.itemType) {
    conditions.push("item_type = ?");
    args.push(options.itemType);
  }
  if (options?.status) {
    conditions.push("status = ?");
    args.push(options.status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await queryAll<CatalogItemRow>(
    `SELECT * FROM ${TABLES.catalogItems} ${where} ORDER BY created_at DESC`,
    args
  );
  return rows.map(mapCatalogItem);
}

// ── Get Catalog Version ──

export async function getCatalogVersion(versionId: string): Promise<CatalogVersion> {
  const row = await queryOne<CatalogVersionRow>(
    `SELECT * FROM ${TABLES.catalogVersions} WHERE id = ?`,
    [versionId]
  );
  if (!row) throw new NotFoundError(`Catalog version not found: ${versionId}`);
  return mapCatalogVersion(row);
}

export async function getCatalogVersionByItemAndVersion(
  catalogItemId: string,
  version: string
): Promise<CatalogVersion> {
  const row = await queryOne<CatalogVersionRow>(
    `SELECT * FROM ${TABLES.catalogVersions} WHERE catalog_item_id = ? AND version = ?`,
    [catalogItemId, version]
  );
  if (!row) {
    throw new NotFoundError(`Catalog version not found: ${catalogItemId}@${version}`);
  }
  return mapCatalogVersion(row);
}

// ── List Catalog Versions ──

export async function listCatalogVersions(
  catalogItemId: string,
  options?: { lifecycleStatus?: VersionLifecycleStatus }
): Promise<CatalogVersion[]> {
  const conditions = ["catalog_item_id = ?"];
  const args: unknown[] = [catalogItemId];
  if (options?.lifecycleStatus) {
    conditions.push("lifecycle_status = ?");
    args.push(options.lifecycleStatus);
  }
  const rows = await queryAll<CatalogVersionRow>(
    `SELECT * FROM ${TABLES.catalogVersions} WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    args
  );
  return rows.map(mapCatalogVersion);
}

// ── Freeze Catalog Version (docs/09 §5.2, §20 CR1) ──

export async function freezeCatalogVersion(
  principal: Principal,
  versionId: string
): Promise<CatalogVersion> {
  requirePlatformRole(principal, "catalog_editor");

  const row = await queryOne<CatalogVersionRow>(
    `SELECT * FROM ${TABLES.catalogVersions} WHERE id = ?`,
    [versionId]
  );
  if (!row) throw new NotFoundError(`Catalog version not found: ${versionId}`);

  const status = row.lifecycle_status as VersionLifecycleStatus;
  if (status === "ready") {
    throw new ConflictError(`Version ${versionId} is already frozen (ready)`);
  }
  if (status === "rejected" || status === "deprecated" || status === "withdrawn") {
    throw new ConflictError(`Version ${versionId} cannot be frozen from status: ${status}`);
  }
  // Only draft/validating can transition to ready
  if (status !== "draft" && status !== "validating") {
    throw new ConflictError(`Version ${versionId} cannot be frozen from status: ${status}`);
  }

  const ts = now();
  await execute(
    `UPDATE ${TABLES.catalogVersions}
     SET lifecycle_status = 'ready', frozen_at = ?
     WHERE id = ?`,
    [ts, versionId]
  );

  const updated = await getCatalogVersion(versionId);

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.version_freeze",
    entityType: "catalog_version",
    entityId: versionId,
    before: { lifecycleStatus: status },
    after: { lifecycleStatus: "ready", frozenAt: ts },
  });

  return updated;
}

// ── Reject Catalog Version ──

export async function rejectCatalogVersion(
  principal: Principal,
  versionId: string,
  reason: string
): Promise<CatalogVersion> {
  requirePlatformRole(principal, "catalog_editor");

  const row = await queryOne<CatalogVersionRow>(
    `SELECT * FROM ${TABLES.catalogVersions} WHERE id = ?`,
    [versionId]
  );
  if (!row) throw new NotFoundError(`Catalog version not found: ${versionId}`);

  const status = row.lifecycle_status as VersionLifecycleStatus;
  if (status !== "draft" && status !== "validating") {
    throw new ConflictError(`Version ${versionId} cannot be rejected from status: ${status}`);
  }

  await execute(
    `UPDATE ${TABLES.catalogVersions}
     SET lifecycle_status = 'rejected'
     WHERE id = ?`,
    [versionId]
  );

  const updated = await getCatalogVersion(versionId);

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.version_reject",
    entityType: "catalog_version",
    entityId: versionId,
    before: { lifecycleStatus: status },
    after: { lifecycleStatus: "rejected", reason },
  });

  return updated;
}
