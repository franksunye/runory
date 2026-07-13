/**
 * Row-level visibility for business records (v0.5.2).
 *
 * Two-layer filtering:
 * 1. Object-level: If the user has no `{objectKey}.read` permission (or `*`)
 *    in any of their permission groups, return empty results.
 * 2. Row-level: For operational objects (work_order, service_visit,
 *    service_report), filter to only show records where the user's resource
 *    has a schedule entry or assignment.
 *
 * Admin/owner roles bypass both layers and see everything.
 */

import { queryAll, queryOne } from "./db";
import { TABLES, businessTable } from "./contracts";
import { getUserPermissionGroups } from "./permission-groups";

// ── Types ──

export interface VisibilityScope {
  /** The user's external_id (as carried in Principal.userId for dev personas). */
  userId: string;
  /** Effective workspace role: "admin" | "member" | "viewer". */
  role: string | null | undefined;
  /** Effective organization role: "owner" | "admin" | "member". */
  organizationRole?: string | null | undefined;
}

export interface RecordVisibilityResult {
  /** If false, the user cannot read this object at all — return empty. */
  canRead: boolean;
  /**
   * SQL fragment to AND into the WHERE clause, or null if no row-level
   * filtering is needed (admin/owner, or non-operational object).
   *
   * The fragment references the table alias `t` for the main business table.
   */
  rowFilterSql: string | null;
  /** Bind parameters for rowFilterSql. */
  rowFilterArgs: unknown[];
}

// ── Operational objects that need row-level filtering ──

const OPERATIONAL_OBJECTS = new Set([
  "work_order",
  "service_visit",
  "service_report",
]);

// Objects that are shared customer data — visible to all members who have
// read permission. These don't get row-level filtering.
const SHARED_OBJECTS = new Set([
  "company",
  "contact",
  "service_site",
  "asset",
  "task",
]);

// ── Permission resolution ──

/**
 * Resolve the effective set of permission strings for a user in a workspace.
 * Returns a Set of permission strings (e.g. "work_order.read", "visit.execute", "*").
 *
 * The userId is resolved by both saas_users.id and external_id to support
 * dev personas.
 */
export async function resolveUserPermissions(
  workspaceId: string,
  userId: string
): Promise<Set<string>> {
  // Resolve the real user id first
  const userRow = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.users} WHERE id = ? OR external_id = ?`,
    [userId, userId]
  );
  if (!userRow) return new Set();

  const groups = await getUserPermissionGroups(workspaceId, userRow.id);
  const perms = new Set<string>();
  for (const g of groups) {
    for (const p of g.permissions) {
      perms.add(p);
    }
  }
  return perms;
}

/**
 * Check if the user has read permission for an object.
 * Permission can be `{objectKey}.read` or `*`.
 */
export function canReadObject(
  permissions: Set<string>,
  objectKey: string
): boolean {
  if (permissions.has("*")) return true;
  return permissions.has(`${objectKey}.read`);
}

// ── Resource resolution ──

/**
 * Resolve the resource IDs linked to a user in a workspace.
 * A user may be linked to zero or more resources (e.g., a technician record).
 */
export async function resolveUserResourceIds(
  workspaceId: string,
  userId: string
): Promise<string[]> {
  const rows = await queryAll<{ id: string }>(
    `SELECT r.id FROM ${TABLES.resources} r
     JOIN ${TABLES.users} u ON u.id = r.user_id
     WHERE r.workspace_id = ? AND (u.id = ? OR u.external_id = ?) AND r.active = 1`,
    [workspaceId, userId, userId]
  );
  return rows.map((r) => r.id);
}

// ── Main entry point ──

/**
 * Resolve the record visibility for a given user + object.
 *
 * Returns:
 * - canRead: false → return empty results
 * - rowFilterSql: null → no row-level filtering (admin or shared object)
 * - rowFilterSql: string → AND this into the WHERE clause
 */
export async function resolveRecordVisibility(
  workspaceId: string,
  objectKey: string,
  scope: VisibilityScope
): Promise<RecordVisibilityResult> {
  // Admin/owner bypass all filtering
  if (scope.role === "admin" || scope.organizationRole === "owner") {
    return { canRead: true, rowFilterSql: null, rowFilterArgs: [] };
  }

  // Resolve permissions
  const permissions = await resolveUserPermissions(workspaceId, scope.userId);

  // Object-level check
  if (!canReadObject(permissions, objectKey)) {
    return { canRead: false, rowFilterSql: null, rowFilterArgs: [] };
  }

  // Shared objects (company, contact, etc.) — visible to all who can read
  if (SHARED_OBJECTS.has(objectKey)) {
    return { canRead: true, rowFilterSql: null, rowFilterArgs: [] };
  }

  // Operational objects — row-level filter by resource assignment
  if (OPERATIONAL_OBJECTS.has(objectKey)) {
    const resourceIds = await resolveUserResourceIds(workspaceId, scope.userId);

    if (resourceIds.length === 0) {
      // User has no resource records — they can still see records they're
      // assigned to directly via work_items, but for operational objects
      // that means they see nothing.
      return {
        canRead: true,
        rowFilterSql: "1 = 0", // no rows match
        rowFilterArgs: [],
      };
    }

    const placeholders = resourceIds.map(() => "?").join(",");

    if (objectKey === "work_order") {
      // Work orders visible if:
      // 1. A schedule entry exists for this work_order with the user's resource, OR
      // 2. A schedule entry exists for a service_visit linked to this work_order
      return {
        canRead: true,
        rowFilterSql: `t.id IN (
          SELECT se.subject_id FROM ${TABLES.scheduleEntries} se
          WHERE se.workspace_id = ? AND se.subject_type = 'work_order'
            AND se.resource_id IN (${placeholders})
          UNION
          SELECT sv.work_order_id FROM ${businessTable("service_visit")} sv
          JOIN ${TABLES.scheduleEntries} se
            ON se.subject_id = sv.id AND se.subject_type = 'service_visit'
           AND se.workspace_id = sv.workspace_id
          WHERE se.workspace_id = ? AND se.resource_id IN (${placeholders})
        )`,
        rowFilterArgs: [
          workspaceId, ...resourceIds,
          workspaceId, ...resourceIds,
        ],
      };
    }

    if (objectKey === "service_visit") {
      // Service visits visible if:
      // 1. A schedule entry exists for this visit with the user's resource, OR
      // 2. An assignment exists for this visit with the user's resource
      return {
        canRead: true,
        rowFilterSql: `t.id IN (
          SELECT se.subject_id FROM ${TABLES.scheduleEntries} se
          WHERE se.workspace_id = ? AND se.subject_type = 'service_visit'
            AND se.resource_id IN (${placeholders})
          UNION
          SELECT a.subject_id FROM ${TABLES.assignments} a
          WHERE a.workspace_id = ? AND a.subject_type = 'service_visit'
            AND a.resource_id IN (${placeholders})
        )`,
        rowFilterArgs: [
          workspaceId, ...resourceIds,
          workspaceId, ...resourceIds,
        ],
      };
    }

    if (objectKey === "service_report") {
      // Service reports visible if the report's work_order or service_visit
      // is assigned to the user's resource via schedule entries.
      return {
        canRead: true,
        rowFilterSql: `t.work_order_id IN (
          SELECT se.subject_id FROM ${TABLES.scheduleEntries} se
          WHERE se.workspace_id = ? AND se.subject_type = 'work_order'
            AND se.resource_id IN (${placeholders})
          UNION
          SELECT sv.work_order_id FROM ${businessTable("service_visit")} sv
          JOIN ${TABLES.scheduleEntries} se
            ON se.subject_id = sv.id AND se.subject_type = 'service_visit'
           AND se.workspace_id = sv.workspace_id
          WHERE se.workspace_id = ? AND se.resource_id IN (${placeholders})
        )`,
        rowFilterArgs: [
          workspaceId, ...resourceIds,
          workspaceId, ...resourceIds,
        ],
      };
    }
  }

  // Default: object is visible without row-level filtering
  return { canRead: true, rowFilterSql: null, rowFilterArgs: [] };
}
