import { queryOne, queryAll, execute, genId, now, batch, db } from "./db";
import { TABLES, BUSINESS_TABLE_PREFIX } from "./contracts";
import {
  type Principal,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InvalidInputError,
} from "./context";
import { writeAuditEvent } from "./audit-service";
import { exportWorkspace } from "./audit";
import { createHash } from "node:crypto";

// ── Types ──

export type DeletionEntityType = "workspace" | "organization" | "user";
export type DeletionStatus = "pending" | "scheduled" | "purging" | "purged" | "restored" | "cancelled";
export type ExportJobStatus = "pending" | "running" | "completed" | "failed";

export interface ExportJob {
  id: string;
  workspaceId: string;
  organizationId: string;
  requestedBy: string;
  status: ExportJobStatus;
  manifestJson: string | null;
  downloadUrl: string | null;
  downloadExpiresAt: string | null;
  checksum: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface DeletionJob {
  id: string;
  entityType: DeletionEntityType;
  entityId: string;
  organizationId: string | null;
  requestedBy: string;
  status: DeletionStatus;
  purgeAfter: string;
  purgedAt: string | null;
  errorMessage: string | null;
  confirmationCodeHash: string | null;
  createdAt: string;
  updatedAt: string;
}

const PURGE_DELAY_DAYS = 30;
const DOWNLOAD_URL_EXPIRY_HOURS = 24;

// ── Export ──

export async function createExportJob(
  workspaceId: string,
  organizationId: string,
  requestedBy: string
): Promise<ExportJob> {
  const id = genId("exp");
  const ts = now();

  await execute(
    `INSERT INTO ${TABLES.exportJobs}
     (id, workspace_id, organization_id, requested_by, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [id, workspaceId, organizationId, requestedBy, ts, ts]
  );

  return {
    id,
    workspaceId,
    organizationId,
    requestedBy,
    status: "pending",
    manifestJson: null,
    downloadUrl: null,
    downloadExpiresAt: null,
    checksum: null,
    errorMessage: null,
    createdAt: ts,
    completedAt: null,
    updatedAt: ts,
  };
}

export async function runExportJob(jobId: string): Promise<ExportJob> {
  const job = await queryOne<{ id: string; workspace_id: string; status: string }>(
    `SELECT id, workspace_id, status FROM ${TABLES.exportJobs} WHERE id = ?`,
    [jobId]
  );
  if (!job) throw new NotFoundError("Export job not found");
  if (job.status !== "pending") throw new ConflictError("Export job is not pending");

  const ts = now();
  await execute(
    `UPDATE ${TABLES.exportJobs} SET status = 'running', updated_at = ? WHERE id = ?`,
    [ts, jobId]
  );

  try {
    // Generate the export manifest
    const data = await exportWorkspace(job.workspace_id);
    const manifestJson = JSON.stringify(data);
    const checksum = createHash("sha256").update(manifestJson).digest("hex");

    // In a real system, this would upload to blob storage and generate a signed URL
    // For now, we store the manifest inline and generate a mock download URL
    const downloadUrl = `urn:runory:export:${jobId}`;
    const downloadExpiresAt = new Date(Date.now() + DOWNLOAD_URL_EXPIRY_HOURS * 3600000).toISOString();

    const completedTs = now();
    await execute(
      `UPDATE ${TABLES.exportJobs}
       SET status = 'completed', manifest_json = ?, download_url = ?, download_expires_at = ?, checksum = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
      [manifestJson, downloadUrl, downloadExpiresAt, checksum, completedTs, completedTs, jobId]
    );

    return {
      id: jobId,
      workspaceId: job.workspace_id,
      organizationId: "",
      requestedBy: "",
      status: "completed",
      manifestJson,
      downloadUrl,
      downloadExpiresAt,
      checksum,
      errorMessage: null,
      createdAt: ts,
      completedAt: completedTs,
      updatedAt: completedTs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await execute(
      `UPDATE ${TABLES.exportJobs} SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`,
      [errorMsg, now(), jobId]
    );
    throw err;
  }
}

export async function getExportJob(jobId: string, workspaceId: string): Promise<ExportJob | null> {
  const row = await queryOne<{
    id: string; workspace_id: string; organization_id: string; requested_by: string;
    status: string; manifest_json: string | null; download_url: string | null;
    download_expires_at: string | null; checksum: string | null; error_message: string | null;
    created_at: string; completed_at: string | null; updated_at: string;
  }>(
    `SELECT * FROM ${TABLES.exportJobs} WHERE id = ? AND workspace_id = ?`,
    [jobId, workspaceId]
  );
  if (!row) return null;

  return {
    id: row.id, workspaceId: row.workspace_id, organizationId: row.organization_id,
    requestedBy: row.requested_by, status: row.status as ExportJobStatus,
    manifestJson: row.manifest_json, downloadUrl: row.download_url,
    downloadExpiresAt: row.download_expires_at, checksum: row.checksum,
    errorMessage: row.error_message, createdAt: row.created_at,
    completedAt: row.completed_at, updatedAt: row.updated_at,
  };
}

// ── Workspace Archive ──

export async function archiveWorkspace(
  workspaceId: string,
  requestedBy: string
): Promise<void> {
  const ws = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM ${TABLES.workspaces} WHERE id = ?`,
    [workspaceId]
  );
  if (!ws) throw new NotFoundError("Workspace not found");
  if (ws.status !== "active") throw new ConflictError("Only active workspaces can be archived");

  const ts = now();
  await execute(
    `UPDATE ${TABLES.workspaces} SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, workspaceId]
  );

  await writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId: requestedBy,
    action: "workspace.archive",
    entityType: "workspace",
    entityId: workspaceId,
    after: { status: "archived", archivedAt: ts },
  });
}

// ── Workspace Soft Delete (schedule purge) ──

export async function scheduleWorkspaceDeletion(
  workspaceId: string,
  organizationId: string,
  requestedBy: string
): Promise<DeletionJob> {
  const ws = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM ${TABLES.workspaces} WHERE id = ?`,
    [workspaceId]
  );
  if (!ws) throw new NotFoundError("Workspace not found");
  if (ws.status === "purged") throw new ConflictError("Workspace already purged");

  // Check for existing pending deletion
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.deletionJobs} WHERE entity_type = 'workspace' AND entity_id = ? AND status IN ('pending','scheduled')`,
    [workspaceId]
  );
  if (existing) throw new ConflictError("Deletion already scheduled for this workspace");

  const id = genId("del");
  const ts = now();
  const purgeAfter = new Date(Date.now() + PURGE_DELAY_DAYS * 86400000).toISOString();

  await execute(
    `INSERT INTO ${TABLES.deletionJobs}
     (id, entity_type, entity_id, organization_id, requested_by, status, purge_after, created_at, updated_at)
     VALUES (?, 'workspace', ?, ?, ?, 'scheduled', ?, ?, ?)`,
    [id, workspaceId, organizationId, requestedBy, purgeAfter, ts, ts]
  );

  // Mark workspace as pending_deletion
  await execute(
    `UPDATE ${TABLES.workspaces} SET status = 'pending_deletion', pending_deletion_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, workspaceId]
  );

  await writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId: requestedBy,
    action: "workspace.delete",
    entityType: "workspace",
    entityId: workspaceId,
    after: { status: "pending_deletion", purgeAfter },
  });

  return {
    id,
    entityType: "workspace",
    entityId: workspaceId,
    organizationId,
    requestedBy,
    status: "scheduled",
    purgeAfter,
    purgedAt: null,
    errorMessage: null,
    confirmationCodeHash: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

// ── Restore Workspace (cancel deletion) ──

export async function restoreWorkspace(
  workspaceId: string,
  requestedBy: string
): Promise<void> {
  const ws = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM ${TABLES.workspaces} WHERE id = ?`,
    [workspaceId]
  );
  if (!ws) throw new NotFoundError("Workspace not found");
  if (ws.status !== "pending_deletion") throw new ConflictError("Workspace is not pending deletion");

  const ts = now();
  await execute(
    `UPDATE ${TABLES.workspaces} SET status = 'active', pending_deletion_at = NULL, updated_at = ? WHERE id = ?`,
    [ts, workspaceId]
  );

  // Cancel deletion job
  await execute(
    `UPDATE ${TABLES.deletionJobs} SET status = 'restored', updated_at = ? WHERE entity_type = 'workspace' AND entity_id = ? AND status = 'scheduled'`,
    [ts, workspaceId]
  );

  await writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId: requestedBy,
    action: "workspace.restore",
    entityType: "workspace",
    entityId: workspaceId,
    after: { status: "active" },
  });
}

// ── Purge Workspace (permanent deletion) ──

export async function purgeWorkspace(workspaceId: string): Promise<void> {
  const ws = await queryOne<{ id: string; status: string; name: string }>(
    `SELECT id, status, name FROM ${TABLES.workspaces} WHERE id = ?`,
    [workspaceId]
  );
  if (!ws) throw new NotFoundError("Workspace not found");

  const ts = now();

  // Discover business tables (runory_business_*) and delete this workspace's
  // records from them. Prevents data leaks where purged workspace business
  // records would survive platform-table cleanup.
  const bizTables = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?`,
    args: [`${BUSINESS_TABLE_PREFIX}%`],
  });
  for (const row of bizTables.rows) {
    const tableName = (row as unknown as { name: string }).name;
    // Check if the table has a workspace_id column before deleting
    const cols = await db.execute({ sql: `PRAGMA table_info("${tableName}")` });
    const hasWorkspaceId = cols.rows.some(
      (c) => (c as unknown as { name: string }).name === "workspace_id"
    );
    if (hasWorkspaceId) {
      await execute(`DELETE FROM "${tableName}" WHERE workspace_id = ?`, [workspaceId]);
    }
  }

  // Delete all workspace-scoped platform data
  const tablesToClean = [
    { table: TABLES.extensionFieldValues, where: "workspace_id" },
    { table: TABLES.auditLogs, where: "workspace_id" },
    { table: TABLES.navigationItems, where: "workspace_id" },
    { table: TABLES.viewDefinitions, where: "workspace_id" },
    { table: TABLES.fieldDefinitions, where: "workspace_id" },
    { table: TABLES.objectDefinitions, where: "workspace_id" },
    { table: TABLES.installations, where: "workspace_id" },
    { table: TABLES.extensionDefinitions, where: "workspace_id" },
    { table: TABLES.workspaceMemberships, where: "workspace_id" },
    { table: TABLES.apiKeys, where: "workspace_id" },
    { table: TABLES.exportJobs, where: "workspace_id" },
  ];

  for (const { table, where } of tablesToClean) {
    await execute(`DELETE FROM ${table} WHERE ${where} = ?`, [workspaceId]);
  }

  // Delete workspace tenant mapping
  await execute(`DELETE FROM ${TABLES.workspaceTenants} WHERE workspace_id = ?`, [workspaceId]);

  // Mark workspace as purged
  await execute(
    `UPDATE ${TABLES.workspaces} SET status = 'purged', purged_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, workspaceId]
  );

  // Update deletion job
  await execute(
    `UPDATE ${TABLES.deletionJobs} SET status = 'purged', purged_at = ?, updated_at = ? WHERE entity_type = 'workspace' AND entity_id = ? AND status IN ('scheduled','purging')`,
    [ts, ts, workspaceId]
  );
}

// ── Organization Deletion (requires OTP confirmation) ──

export async function scheduleOrganizationDeletion(
  organizationId: string,
  requestedBy: string,
  confirmationCode: string
): Promise<DeletionJob> {
  // Verify the requester is the org owner
  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM ${TABLES.organizationMemberships} WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    [organizationId, requestedBy]
  );
  if (!membership || membership.role !== "owner") {
    throw new AuthorizationError("Only organization owner can delete the organization");
  }

  // Hash the confirmation code for audit
  const codeHash = createHash("sha256").update(confirmationCode).digest("hex");

  const id = genId("del");
  const ts = now();
  const purgeAfter = new Date(Date.now() + PURGE_DELAY_DAYS * 86400000).toISOString();

  await execute(
    `INSERT INTO ${TABLES.deletionJobs}
     (id, entity_type, entity_id, organization_id, requested_by, status, purge_after, confirmation_code_hash, created_at, updated_at)
     VALUES (?, 'organization', ?, ?, ?, 'scheduled', ?, ?, ?, ?)`,
    [id, organizationId, organizationId, requestedBy, purgeAfter, codeHash, ts, ts]
  );

  // Mark organization as pending deletion
  await execute(
    `UPDATE ${TABLES.organizations} SET status = 'pending_deletion', updated_at = ? WHERE id = ?`,
    [ts, organizationId]
  );

  await writeAuditEvent({
    workspaceId: organizationId, // Use org ID as scope for org-level events
    actorType: "user",
    actorId: requestedBy,
    action: "organization.delete",
    entityType: "organization",
    entityId: organizationId,
    after: { status: "pending_deletion", purgeAfter },
  });

  return {
    id,
    entityType: "organization",
    entityId: organizationId,
    organizationId,
    requestedBy,
    status: "scheduled",
    purgeAfter,
    purgedAt: null,
    errorMessage: null,
    confirmationCodeHash: codeHash,
    createdAt: ts,
    updatedAt: ts,
  };
}

// ── Purge Organization ──

export async function purgeOrganization(organizationId: string): Promise<void> {
  const ts = now();

  // Get all workspaces for this org
  const workspaces = await queryAll<{ workspace_id: string }>(
    `SELECT workspace_id FROM ${TABLES.workspaceTenants} WHERE organization_id = ?`,
    [organizationId]
  );

  // Purge each workspace
  for (const ws of workspaces) {
    await purgeWorkspace(ws.workspace_id);
  }

  // Delete org-level data
  await execute(`DELETE FROM ${TABLES.organizationMemberships} WHERE organization_id = ?`, [organizationId]);
  await execute(`DELETE FROM ${TABLES.organizationInvitations} WHERE organization_id = ?`, [organizationId]);
  await execute(`DELETE FROM ${TABLES.organizationEntitlements} WHERE organization_id = ?`, [organizationId]);
  await execute(`DELETE FROM ${TABLES.workspaceTenants} WHERE organization_id = ?`, [organizationId]);
  await execute(`DELETE FROM ${TABLES.deletionJobs} WHERE organization_id = ?`, [organizationId]);

  // Mark organization as purged
  await execute(
    `UPDATE ${TABLES.organizations} SET status = 'purged', updated_at = ? WHERE id = ?`,
    [ts, organizationId]
  );
}

// ── User Account Deletion ──

export async function deleteUserAccount(userId: string): Promise<void> {
  const ts = now();

  // Revoke all sessions
  await execute(`DELETE FROM ${TABLES.sessions} WHERE user_id = ?`, [userId]);

  // Revoke all API keys
  await execute(
    `UPDATE ${TABLES.apiKeys} SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE user_id = ? AND status = 'active'`,
    [ts, ts, userId]
  );

  // Remove workspace memberships
  await execute(`DELETE FROM ${TABLES.workspaceMemberships} WHERE user_id = ?`, [userId]);

  // Remove organization memberships
  await execute(`DELETE FROM ${TABLES.organizationMemberships} WHERE user_id = ?`, [userId]);

  // Anonymize user in audit logs (keep audit trail but remove personal info)
  await execute(
    `UPDATE ${TABLES.auditLogs} SET actor_id = 'anonymized' WHERE actor_id = ? AND actor_type = 'user'`,
    [userId]
  );

  // Anonymize user record
  await execute(
    `UPDATE ${TABLES.users} SET email = NULL, display_name = '[deleted]', status = 'deleted', updated_at = ? WHERE id = ?`,
    [ts, userId]
  );

  // Remove auth identities
  await execute(`DELETE FROM ${TABLES.authIdentities} WHERE user_id = ?`, [userId]);
}

// ── Get deletion job ──

export async function getDeletionJob(
  entityId: string,
  entityType?: DeletionEntityType
): Promise<DeletionJob | null> {
  const conditions = ["entity_id = ?"];
  const args: unknown[] = [entityId];
  if (entityType) {
    conditions.push("entity_type = ?");
    args.push(entityType);
  }

  const row = await queryOne<{
    id: string; entity_type: string; entity_id: string; organization_id: string | null;
    requested_by: string; status: string; purge_after: string; purged_at: string | null;
    error_message: string | null; confirmation_code_hash: string | null;
    created_at: string; updated_at: string;
  }>(
    `SELECT * FROM ${TABLES.deletionJobs} WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 1`,
    args
  );
  if (!row) return null;

  return {
    id: row.id,
    entityType: row.entity_type as DeletionEntityType,
    entityId: row.entity_id,
    organizationId: row.organization_id,
    requestedBy: row.requested_by,
    status: row.status as DeletionStatus,
    purgeAfter: row.purge_after,
    purgedAt: row.purged_at,
    errorMessage: row.error_message,
    confirmationCodeHash: row.confirmation_code_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
