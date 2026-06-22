import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import {
  type Principal,
  ConflictError,
  NotFoundError,
  InvalidInputError,
} from "./context";
import { writeAuditEvent } from "./audit-service";
import { requirePlatformRole } from "./catalog-registry";
import { getRelease } from "./catalog-release";
import { getCatalogVersion } from "./catalog-registry";

// ── Types ──

export type RolloutStatus =
  | "draft"
  | "running"
  | "paused"
  | "resumed"
  | "completed"
  | "canceled";

export type RolloutTargetType = "allowlist" | "percentage" | "all_eligible";

export type RolloutTargetStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export interface ReleaseRollout {
  id: string;
  catalogReleaseId: string;
  targetType: RolloutTargetType;
  targetConfigJson: string;
  status: RolloutStatus;
  successThreshold: number;
  failureThreshold: number;
  startedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface RolloutTarget {
  id: string;
  rolloutId: string;
  workspaceId: string;
  fromVersionId: string | null;
  toVersionId: string;
  status: RolloutTargetStatus;
  reasonCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface RolloutProgress {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  skipped: number;
  successRate: number;
  failureRate: number;
}

// ── DB Row Types (snake_case) ──

interface ReleaseRolloutRow {
  id: string;
  catalog_release_id: string;
  target_type: string;
  target_config_json: string;
  status: string;
  success_threshold: number;
  failure_threshold: number;
  started_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface RolloutTargetRow {
  id: string;
  rollout_id: string;
  workspace_id: string;
  from_version_id: string | null;
  to_version_id: string;
  status: string;
  reason_code: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ── Row → Object Mappers ──

function mapReleaseRollout(row: ReleaseRolloutRow): ReleaseRollout {
  return {
    id: row.id,
    catalogReleaseId: row.catalog_release_id,
    targetType: row.target_type as RolloutTargetType,
    targetConfigJson: row.target_config_json,
    status: row.status as RolloutStatus,
    successThreshold: row.success_threshold,
    failureThreshold: row.failure_threshold,
    startedBy: row.started_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function mapRolloutTarget(row: RolloutTargetRow): RolloutTarget {
  return {
    id: row.id,
    rolloutId: row.rollout_id,
    workspaceId: row.workspace_id,
    fromVersionId: row.from_version_id,
    toVersionId: row.to_version_id,
    status: row.status as RolloutTargetStatus,
    reasonCode: row.reason_code,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

// ── Helper: Find workspaces that have the module installed ──
//
// Resolves the catalog item name (module_id) from the release's catalog version,
// then queries installations for that module. Returns workspace_id and the
// currently-installed catalog_version_id (if any) for each installation.

interface InstalledWorkspace {
  workspaceId: string;
  fromVersionId: string | null;
}

async function findInstalledWorkspaces(
  catalogVersionId: string
): Promise<InstalledWorkspace[]> {
  const version = await getCatalogVersion(catalogVersionId);
  const moduleId = await getCatalogItemName(version.catalogItemId);

  const rows = await queryAll<{
    workspace_id: string;
    catalog_version_id: string | null;
    status: string;
  }>(
    `SELECT workspace_id, catalog_version_id, status
     FROM ${TABLES.installations}
     WHERE module_id = ? AND status = 'installed'`,
    [moduleId]
  );

  return rows.map((r) => ({
    workspaceId: r.workspace_id,
    fromVersionId: r.catalog_version_id,
  }));
}

async function getCatalogItemName(catalogItemId: string): Promise<string> {
  const row = await queryOne<{ name: string }>(
    `SELECT name FROM ${TABLES.catalogItems} WHERE id = ?`,
    [catalogItemId]
  );
  if (!row) throw new NotFoundError(`Catalog item not found: ${catalogItemId}`);
  return row.name;
}

// ── Create Release Rollout (docs/09 §5.4, §14) ──

export async function createReleaseRollout(
  principal: Principal,
  params: {
    catalogReleaseId: string;
    targetType: RolloutTargetType;
    targetConfig: {
      workspaceIds?: string[];
      percentage?: number;
    };
    successThreshold?: number;
    failureThreshold?: number;
  }
): Promise<ReleaseRollout> {
  requirePlatformRole(principal, "release_manager");

  // Load the release, must be active
  const release = await getRelease(params.catalogReleaseId);
  if (release.status !== "active") {
    throw new ConflictError(
      `Release ${params.catalogReleaseId} must be 'active' to create a rollout (current: ${release.status})`
    );
  }

  const successThreshold = params.successThreshold ?? 0.95;
  const failureThreshold = params.failureThreshold ?? 0.05;

  // Validate target config based on target type
  if (params.targetType === "allowlist") {
    if (
      !params.targetConfig.workspaceIds ||
      params.targetConfig.workspaceIds.length === 0
    ) {
      throw new InvalidInputError(
        "allowlist rollout requires targetConfig.workspaceIds"
      );
    }
  } else if (params.targetType === "percentage") {
    if (
      params.targetConfig.percentage === undefined ||
      params.targetConfig.percentage < 0 ||
      params.targetConfig.percentage > 100
    ) {
      throw new InvalidInputError(
        "percentage rollout requires targetConfig.percentage between 0 and 100"
      );
    }
  }

  // Resolve target workspaces based on target type
  let targets: InstalledWorkspace[] = [];
  if (params.targetType === "allowlist") {
    // For allowlist, use the explicitly provided workspace IDs.
    // Look up each workspace's current installation to determine from_version_id.
    const version = await getCatalogVersion(release.catalogVersionId);
    const moduleId = await getCatalogItemName(version.catalogItemId);
    for (const workspaceId of params.targetConfig.workspaceIds!) {
      const inst = await queryOne<{ catalog_version_id: string | null }>(
        `SELECT catalog_version_id FROM ${TABLES.installations}
         WHERE workspace_id = ? AND module_id = ? AND status = 'installed'`,
        [workspaceId, moduleId]
      );
      targets.push({
        workspaceId,
        fromVersionId: inst?.catalog_version_id ?? null,
      });
    }
  } else {
    // percentage or all_eligible: query all workspaces with the module installed
    const installed = await findInstalledWorkspaces(release.catalogVersionId);
    if (params.targetType === "all_eligible") {
      targets = installed;
    } else {
      // percentage: select `percentage`% of installed workspaces
      const pct = params.targetConfig.percentage!;
      const count = Math.ceil((installed.length * pct) / 100);
      targets = installed.slice(0, count);
    }
  }

  const rolloutId = genId("roll");
  const ts = now();
  const targetConfigJson = JSON.stringify(params.targetConfig ?? {});
  const toVersionId = release.catalogVersionId;
  const status: RolloutStatus = targets.length > 0 ? "running" : "draft";

  await execute(
    `INSERT INTO ${TABLES.releaseRollouts}
     (id, catalog_release_id, target_type, target_config_json, status,
      success_threshold, failure_threshold, started_by, started_at, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      rolloutId,
      params.catalogReleaseId,
      params.targetType,
      targetConfigJson,
      status,
      successThreshold,
      failureThreshold,
      status === "running" ? principal.userId : null,
      status === "running" ? ts : null,
      ts,
    ]
  );

  // Insert rollout target rows with status = 'pending'
  for (const target of targets) {
    const targetId = genId("rtgt");
    await execute(
      `INSERT INTO ${TABLES.rolloutTargets}
       (id, rollout_id, workspace_id, from_version_id, to_version_id,
        status, reason_code, started_at, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?)`,
      [
        targetId,
        rolloutId,
        target.workspaceId,
        target.fromVersionId,
        toVersionId,
        ts,
      ]
    );
  }

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.rollout_create",
    entityType: "release_rollout",
    entityId: rolloutId,
    after: {
      catalogReleaseId: params.catalogReleaseId,
      targetType: params.targetType,
      status,
      targetCount: targets.length,
      successThreshold,
      failureThreshold,
    },
  });

  return getRollout(rolloutId);
}

// ── Pause Release Rollout (docs/09 §5.4) ──
//
// Pause only stops NEW targets from being processed; it does not undo
// succeeded upgrades.

export async function pauseReleaseRollout(
  principal: Principal,
  rolloutId: string,
  reason: string
): Promise<ReleaseRollout> {
  requirePlatformRole(principal, "release_manager");

  const rollout = await getRollout(rolloutId);
  if (rollout.status !== "running" && rollout.status !== "resumed") {
    throw new ConflictError(
      `Rollout ${rolloutId} must be 'running' or 'resumed' to pause (current: ${rollout.status})`
    );
  }

  const previousStatus = rollout.status;
  await execute(
    `UPDATE ${TABLES.releaseRollouts} SET status = 'paused' WHERE id = ?`,
    [rolloutId]
  );

  const updated = await getRollout(rolloutId);

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.rollout_pause",
    entityType: "release_rollout",
    entityId: rolloutId,
    before: { status: previousStatus },
    after: { status: "paused", reason },
  });

  return updated;
}

// ── Resume Release Rollout ──

export async function resumeReleaseRollout(
  principal: Principal,
  rolloutId: string
): Promise<ReleaseRollout> {
  requirePlatformRole(principal, "release_manager");

  const rollout = await getRollout(rolloutId);
  if (rollout.status !== "paused") {
    throw new ConflictError(
      `Rollout ${rolloutId} must be 'paused' to resume (current: ${rollout.status})`
    );
  }

  await execute(
    `UPDATE ${TABLES.releaseRollouts} SET status = 'resumed' WHERE id = ?`,
    [rolloutId]
  );

  const updated = await getRollout(rolloutId);

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.rollout_resume",
    entityType: "release_rollout",
    entityId: rolloutId,
    before: { status: "paused" },
    after: { status: "resumed" },
  });

  return updated;
}

// ── Cancel Release Rollout ──

export async function cancelReleaseRollout(
  principal: Principal,
  rolloutId: string,
  reason: string
): Promise<ReleaseRollout> {
  requirePlatformRole(principal, "release_manager");

  const rollout = await getRollout(rolloutId);
  if (rollout.status === "completed" || rollout.status === "canceled") {
    throw new ConflictError(
      `Rollout ${rolloutId} cannot be canceled from status: ${rollout.status}`
    );
  }

  const previousStatus = rollout.status;
  const ts = now();
  await execute(
    `UPDATE ${TABLES.releaseRollouts}
     SET status = 'canceled', completed_at = ?
     WHERE id = ?`,
    [ts, rolloutId]
  );

  // Set all pending targets to skipped
  await execute(
    `UPDATE ${TABLES.rolloutTargets}
     SET status = 'skipped', completed_at = ?
     WHERE rollout_id = ? AND status = 'pending'`,
    [ts, rolloutId]
  );

  const updated = await getRollout(rolloutId);

  await writeAuditEvent({
    workspaceId: "platform",
    actorType: "user",
    actorId: principal.userId,
    action: "catalog.rollout_cancel",
    entityType: "release_rollout",
    entityId: rolloutId,
    before: { status: previousStatus },
    after: { status: "canceled", reason },
  });

  return updated;
}

// ── Get Rollout ──

export async function getRollout(rolloutId: string): Promise<ReleaseRollout> {
  const row = await queryOne<ReleaseRolloutRow>(
    `SELECT * FROM ${TABLES.releaseRollouts} WHERE id = ?`,
    [rolloutId]
  );
  if (!row) throw new NotFoundError(`Rollout not found: ${rolloutId}`);
  return mapReleaseRollout(row);
}

// ── Get Rollout Progress (docs/09 §14, §17) ──

export async function getRolloutProgress(
  rolloutId: string
): Promise<RolloutProgress> {
  // Ensure the rollout exists
  await getRollout(rolloutId);

  const rows = await queryAll<{ status: string; cnt: number }>(
    `SELECT status, COUNT(*) AS cnt
     FROM ${TABLES.rolloutTargets}
     WHERE rollout_id = ?
     GROUP BY status`,
    [rolloutId]
  );

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    counts[row.status] = row.cnt;
    total += row.cnt;
  }

  const succeeded = counts["succeeded"] ?? 0;
  const failed = counts["failed"] ?? 0;
  const settled = succeeded + failed;
  const successRate = settled > 0 ? succeeded / settled : 0;
  const failureRate = settled > 0 ? failed / settled : 0;

  return {
    total,
    pending: counts["pending"] ?? 0,
    running: counts["running"] ?? 0,
    succeeded,
    failed,
    skipped: counts["skipped"] ?? 0,
    successRate,
    failureRate,
  };
}

// ── List Rollout Targets ──

export async function listRolloutTargets(
  rolloutId: string,
  options?: { status?: RolloutTargetStatus }
): Promise<RolloutTarget[]> {
  const conditions = ["rollout_id = ?"];
  const args: unknown[] = [rolloutId];
  if (options?.status) {
    conditions.push("status = ?");
    args.push(options.status);
  }
  const rows = await queryAll<RolloutTargetRow>(
    `SELECT * FROM ${TABLES.rolloutTargets}
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at ASC`,
    args
  );
  return rows.map(mapRolloutTarget);
}

// ── Update Rollout Target Status (called by the upgrade executor) ──

export async function updateRolloutTargetStatus(
  targetId: string,
  status: RolloutTargetStatus,
  reasonCode?: string
): Promise<void> {
  const target = await queryOne<RolloutTargetRow>(
    `SELECT * FROM ${TABLES.rolloutTargets} WHERE id = ?`,
    [targetId]
  );
  if (!target) throw new NotFoundError(`Rollout target not found: ${targetId}`);

  const ts = now();
  const startedAt =
    status === "running" ? ts : target.started_at;
  const completedAt =
    status === "succeeded" || status === "failed" || status === "skipped"
      ? ts
      : target.completed_at;

  await execute(
    `UPDATE ${TABLES.rolloutTargets}
     SET status = ?, reason_code = ?, started_at = ?, completed_at = ?
     WHERE id = ?`,
    [status, reasonCode ?? null, startedAt, completedAt, targetId]
  );

  // Failure isolation: if a target failed, check whether the rollout should
  // be auto-paused based on the failure threshold.
  if (status === "failed") {
    await checkThresholdAndAutoPause(target.rollout_id);
  }
}

// ── Check Threshold and Auto-Pause ──
//
// Returns true if the rollout was auto-paused.

export async function checkThresholdAndAutoPause(
  rolloutId: string
): Promise<boolean> {
  const rollout = await getRollout(rolloutId);

  // Only running/resumed rollouts are candidates for auto-pause.
  if (rollout.status !== "running" && rollout.status !== "resumed") {
    return false;
  }

  const progress = await getRolloutProgress(rolloutId);
  const settled = progress.succeeded + progress.failed;
  if (settled === 0) return false;

  if (progress.failureRate > rollout.failureThreshold) {
    const previousStatus = rollout.status;
    await execute(
      `UPDATE ${TABLES.releaseRollouts} SET status = 'paused' WHERE id = ?`,
      [rolloutId]
    );

    await writeAuditEvent({
      workspaceId: "platform",
      actorType: "system",
      actorId: "system",
      action: "catalog.rollout_pause",
      entityType: "release_rollout",
      entityId: rolloutId,
      before: { status: previousStatus },
      after: {
        status: "paused",
        reason: "auto-paused: failure threshold exceeded",
        failureRate: progress.failureRate,
        failureThreshold: rollout.failureThreshold,
        succeeded: progress.succeeded,
        failed: progress.failed,
      },
    });

    return true;
  }

  return false;
}
