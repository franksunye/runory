import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";

// ── Pack-aware Permission Groups (v0.3.6) ──

export interface PackPermissionGroup {
  id: string;
  workspaceId: string;
  packId: string;
  groupKey: string;
  label: string;
  description: string | null;
  permissions: string[];
  businessRoleKey: string | null;
  businessRoleLabel: string | null;
  businessRoleDescription: string | null;
  createdAt: string;
}

export interface BusinessRole {
  id: string;
  roleKey: string;
  label: string;
  description: string | null;
  permissions: string[];
  packIds: string[];
}

export interface PackPermissionAssignment {
  id: string;
  workspaceId: string;
  groupId: string;
  userId: string;
  assignedBy: string | null;
  assignedAt: string;
}

/**
 * Sync permission groups from a pack manifest into the database (v0.3.6).
 * Called during pack installation. Idempotent — existing groups are updated, not duplicated.
 */
export async function syncPackPermissionGroups(
  workspaceId: string,
  packId: string,
  groups: Array<{
    key: string;
    label: string;
    description?: string;
    permissions: string[];
    businessRole?: { key: string; label: string; description?: string };
  }>
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const group of groups) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM ${TABLES.packPermissionGroups}
       WHERE workspace_id = ? AND pack_id = ? AND group_key = ?`,
      [workspaceId, packId, group.key]
    );

    if (existing) {
      await execute(
        `UPDATE ${TABLES.packPermissionGroups}
         SET label = ?, description = ?, permissions_json = ?, business_role_key = ?,
             business_role_label = ?, business_role_description = ?
         WHERE id = ?`,
        [group.label, group.description ?? null, JSON.stringify(group.permissions),
          group.businessRole?.key ?? null, group.businessRole?.label ?? null,
          group.businessRole?.description ?? null, existing.id]
      );
      updated++;
    } else {
      await execute(
        `INSERT INTO ${TABLES.packPermissionGroups}
         (id, workspace_id, pack_id, group_key, label, description, permissions_json,
          business_role_key, business_role_label, business_role_description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [genId("ppg"), workspaceId, packId, group.key, group.label, group.description ?? null,
          JSON.stringify(group.permissions), group.businessRole?.key ?? null,
          group.businessRole?.label ?? null, group.businessRole?.description ?? null, now()]
      );
      created++;
    }
  }

  return { created, updated };
}

/**
 * Get all permission groups for a workspace, optionally filtered by pack.
 */
export async function getPackPermissionGroups(
  workspaceId: string,
  packId?: string
): Promise<PackPermissionGroup[]> {
  const sql = packId
    ? `SELECT * FROM ${TABLES.packPermissionGroups} WHERE workspace_id = ? AND pack_id = ? ORDER BY pack_id, group_key`
    : `SELECT * FROM ${TABLES.packPermissionGroups} WHERE workspace_id = ? ORDER BY pack_id, group_key`;
  const params = packId ? [workspaceId, packId] : [workspaceId];

  const rows = await queryAll<{
    id: string; workspace_id: string; pack_id: string; group_key: string;
    label: string; description: string | null; permissions_json: string;
    business_role_key: string | null; business_role_label: string | null;
    business_role_description: string | null; created_at: string;
  }>(sql, params);

  return rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    packId: r.pack_id,
    groupKey: r.group_key,
    label: r.label,
    description: r.description,
    permissions: r.permissions_json ? JSON.parse(r.permissions_json) : [],
    businessRoleKey: r.business_role_key,
    businessRoleLabel: r.business_role_label,
    businessRoleDescription: r.business_role_description,
    createdAt: r.created_at,
  }));
}

/** Installed Pack contributions aggregated into stable workspace roles. */
export async function getBusinessRoles(workspaceId: string): Promise<BusinessRole[]> {
  const groups = (await getPackPermissionGroups(workspaceId))
    .filter((group) => group.groupKey !== "workspace_administrator");
  const roles = new Map<string, BusinessRole>();
  for (const group of groups) {
    const roleKey = group.businessRoleKey ?? `${group.packId}:${group.groupKey}`;
    const existing = roles.get(roleKey) ?? {
      id: roleKey,
      roleKey,
      label: group.businessRoleLabel ?? group.label,
      description: group.businessRoleDescription ?? group.description,
      permissions: [],
      packIds: [],
    };
    existing.permissions = [...new Set([...existing.permissions, ...group.permissions])];
    if (!existing.packIds.includes(group.packId)) existing.packIds.push(group.packId);
    roles.set(roleKey, existing);
  }
  return [...roles.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export async function getBusinessRoleAssignments(
  workspaceId: string
): Promise<Array<{ roleKey: string; userId: string }>> {
  const rows = await queryAll<{ role_key: string; user_id: string }>(
    `SELECT role_key, user_id FROM ${TABLES.businessRoleAssignments} WHERE workspace_id = ?`,
    [workspaceId]
  );
  return rows.map((row) => ({ roleKey: row.role_key, userId: row.user_id }));
}

export async function assignBusinessRole(
  workspaceId: string,
  roleKey: string,
  userId: string,
  assignedBy: string
): Promise<{ assigned: boolean }> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.businessRoleAssignments}
     WHERE workspace_id = ? AND role_key = ? AND user_id = ?`,
    [workspaceId, roleKey, userId]
  );
  if (existing) return { assigned: false };
  await execute(
    `INSERT INTO ${TABLES.businessRoleAssignments}
     (id, workspace_id, role_key, user_id, assigned_by, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [genId("bra"), workspaceId, roleKey, userId, assignedBy, now()]
  );
  return { assigned: true };
}

export async function removeBusinessRoleAssignment(
  workspaceId: string,
  roleKey: string,
  userId: string
): Promise<{ removed: boolean }> {
  await execute(
    `DELETE FROM ${TABLES.businessRoleAssignments}
     WHERE workspace_id = ? AND role_key = ? AND user_id = ?`,
    [workspaceId, roleKey, userId]
  );
  // Compatibility cleanup: a role migrated from pre-0031 may still have
  // direct Pack-group assignments. Leaving them behind would make revocation
  // appear successful while permissions remained effective.
  await execute(
    `DELETE FROM ${TABLES.packPermissionAssignments}
     WHERE workspace_id = ? AND user_id = ? AND group_id IN (
       SELECT id FROM ${TABLES.packPermissionGroups}
       WHERE workspace_id = ? AND business_role_key = ?
     )`,
    [workspaceId, userId, workspaceId, roleKey]
  );
  return { removed: true };
}

/**
 * Assign a user to a permission group.
 */
export async function assignPackPermissionGroup(
  workspaceId: string,
  groupId: string,
  userId: string,
  assignedBy: string
): Promise<{ assigned: boolean }> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.packPermissionAssignments}
     WHERE workspace_id = ? AND group_id = ? AND user_id = ?`,
    [workspaceId, groupId, userId]
  );
  if (existing) {
    return { assigned: false }; // Already assigned
  }

  await execute(
    `INSERT INTO ${TABLES.packPermissionAssignments}
     (id, workspace_id, group_id, user_id, assigned_by, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [genId("ppa"), workspaceId, groupId, userId, assignedBy, now()]
  );
  return { assigned: true };
}

/**
 * Remove a user from a permission group.
 */
export async function removePackPermissionAssignment(
  workspaceId: string,
  groupId: string,
  userId: string
): Promise<{ removed: boolean }> {
  const result = await execute(
    `DELETE FROM ${TABLES.packPermissionAssignments}
     WHERE workspace_id = ? AND group_id = ? AND user_id = ?`,
    [workspaceId, groupId, userId]
  );
  return { removed: true };
}

/**
 * Get all permission group assignments for a user in a workspace.
 */
export async function getUserPermissionGroups(
  workspaceId: string,
  userId: string
): Promise<Array<{ groupId: string; packId: string; groupKey: string; label: string; permissions: string[] }>> {
  const rows = await queryAll<{
    ppg_id: string; ppg_pack_id: string; ppg_group_key: string;
    ppg_label: string; ppg_permissions_json: string;
  }>(
    `SELECT ppg.id AS ppg_id, ppg.pack_id AS ppg_pack_id,
            ppg.group_key AS ppg_group_key, ppg.label AS ppg_label,
            ppg.permissions_json AS ppg_permissions_json
     FROM ${TABLES.packPermissionGroups} ppg
     WHERE ppg.workspace_id = ? AND (
       EXISTS (
         SELECT 1 FROM ${TABLES.packPermissionAssignments} ppa
         WHERE ppa.workspace_id = ppg.workspace_id AND ppa.group_id = ppg.id AND ppa.user_id = ?
       ) OR EXISTS (
         SELECT 1 FROM ${TABLES.businessRoleAssignments} bra
         WHERE bra.workspace_id = ppg.workspace_id AND bra.user_id = ?
           AND bra.role_key = COALESCE(ppg.business_role_key, ppg.pack_id || ':' || ppg.group_key)
       )
     )`,
    [workspaceId, userId, userId]
  );

  return rows.map(r => ({
    groupId: r.ppg_id,
    packId: r.ppg_pack_id,
    groupKey: r.ppg_group_key,
    label: r.ppg_label,
    permissions: r.ppg_permissions_json ? JSON.parse(r.ppg_permissions_json) : [],
  }));
}

/**
 * Get all assignments for a permission group.
 */
export async function getPermissionGroupAssignments(
  workspaceId: string,
  groupId: string
): Promise<PackPermissionAssignment[]> {
  const rows = await queryAll<{
    id: string; workspace_id: string; group_id: string; user_id: string;
    assigned_by: string | null; assigned_at: string;
  }>(
    `SELECT * FROM ${TABLES.packPermissionAssignments}
     WHERE workspace_id = ? AND group_id = ? ORDER BY assigned_at`,
    [workspaceId, groupId]
  );

  return rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    groupId: r.group_id,
    userId: r.user_id,
    assignedBy: r.assigned_by,
    assignedAt: r.assigned_at,
  }));
}
