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
// any operational access. These don't get row-level filtering.
const SHARED_OBJECTS = new Set([
  "company",
  "contact",
  "service_site",
  "asset",
  "task",
]);

/**
 * Mapping from object key to the set of permissions that grant read access.
 *
 * The permission system is action-based, not purely object-based. For example,
 * `visit.execute` implies the ability to read service_visit records, and
 * `work_order.read` implies the ability to read associated customer data.
 *
 * If the user has ANY permission in the set (or `*`), they can read the object.
 */
const OBJECT_READ_PERMISSIONS: Record<string, string[]> = {
  work_order: ["work_order.read", "work_order.triage", "work_order.start", "work_order.complete", "work_order.reopen"],
  service_visit: ["visit.execute", "service_visit.read"],
  service_report: ["service_report.read", "work_order.read", "work_order.complete"],
  quote: ["quote.read", "quote.create", "quote.send", "quote.accept", "quote.reject"],
  company: ["company.read", "work_order.read", "visit.execute", "quote.read", "quote.create"],
  contact: ["contact.read", "company.read", "work_order.read", "visit.execute"],
  service_site: ["service_site.read", "company.read", "work_order.read", "visit.execute"],
  asset: ["asset.read", "company.read", "work_order.read", "visit.execute"],
  task: ["task.read", "work_order.read", "visit.execute"],
};

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
 * Uses OBJECT_READ_PERMISSIONS mapping to account for action-based permissions
 * (e.g., visit.execute grants read access to service_visit records).
 */
export function canReadObject(
  permissions: Set<string>,
  objectKey: string
): boolean {
  if (permissions.has("*")) return true;
  // Check for explicit {objectKey}.read
  if (permissions.has(`${objectKey}.read`)) return true;
  // Check against the permission mapping
  const allowed = OBJECT_READ_PERMISSIONS[objectKey];
  if (allowed) {
    return allowed.some((p) => permissions.has(p));
  }
  // Unknown object — require explicit read permission
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
