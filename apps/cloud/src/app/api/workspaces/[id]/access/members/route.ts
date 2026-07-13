import { NextRequest } from "next/server";
import {
  getBusinessRoles,
  getBusinessRoleAssignments,
  queryAll,
  TABLES,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, forbidden, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

interface PersonRow {
  user_id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  user_status: string;
  organization_role: "owner" | "admin" | "member" | null;
  workspace_role: "admin" | "member" | "viewer" | null;
  joined_at: string | null;
}

interface ResourceRow {
  id: string;
  display_name: string;
  resource_type: string;
  user_id: string | null;
}

interface CurrentUserRow {
  id: string;
}

const TEAM_SCOPE_PERMISSIONS = new Set([
  "work_order.triage",
  "assignment.manage",
  "schedule.manage",
  "schedule.conflict.override",
  "work_order.complete",
  "work_order.reopen",
  "form.review",
]);

function canManage(workspaceRole: string | null, organizationRole: string | null): boolean {
  return workspaceRole === "admin" || organizationRole === "owner" || organizationRole === "admin";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    if (!canManage(ctx.workspaceRole, ctx.organizationRole)) {
      return forbidden("Workspace administrator access required", ctx.requestId);
    }

    const people = await queryAll<PersonRow>(
      `SELECT u.id AS user_id, u.display_name, u.email, u.avatar_url, u.status AS user_status,
              om.role AS organization_role, wm.role AS workspace_role,
              COALESCE(wm.created_at, om.created_at) AS joined_at
       FROM ${TABLES.users} u
       LEFT JOIN ${TABLES.organizationMemberships} om
         ON om.user_id = u.id AND om.organization_id = ? AND om.status = 'active'
       LEFT JOIN ${TABLES.workspaceMemberships} wm
         ON wm.user_id = u.id AND wm.workspace_id = ? AND wm.status = 'active'
       WHERE om.id IS NOT NULL OR wm.id IS NOT NULL
       ORDER BY wm.id IS NULL, u.display_name ASC`,
      [ctx.organizationId, workspaceId]
    );

    const [roles, roleAssignments, resources, currentUser] = await Promise.all([
      getBusinessRoles(workspaceId),
      getBusinessRoleAssignments(workspaceId),
      queryAll<ResourceRow>(
        `SELECT id, display_name, resource_type, user_id
         FROM ${TABLES.resources}
         WHERE workspace_id = ? AND active = 1
         ORDER BY display_name ASC`,
        [workspaceId]
      ),
      queryAll<CurrentUserRow>(
        `SELECT id FROM ${TABLES.users} WHERE id = ? OR external_id = ? LIMIT 1`,
        [ctx.principal?.userId ?? "", ctx.principal?.userId ?? ""]
      ).then((rows) => rows[0] ?? null),
    ]);

    const roleKeysByUser = new Map<string, Set<string>>();
    for (const assignment of roleAssignments) {
      const keys = roleKeysByUser.get(assignment.userId) ?? new Set<string>();
      keys.add(assignment.roleKey);
      roleKeysByUser.set(assignment.userId, keys);
    }

    const resourceIdsByUser = new Map<string, Set<string>>();
    for (const resource of resources) {
      if (!resource.user_id) continue;
      const ids = resourceIdsByUser.get(resource.user_id) ?? new Set<string>();
      ids.add(resource.id);
      resourceIdsByUser.set(resource.user_id, ids);
    }

    const members = people.map((person) => {
      const assignedRoleKeys = roleKeysByUser.get(person.user_id) ?? new Set<string>();
      const businessRoles = roles.filter((role) => assignedRoleKeys.has(role.roleKey));
      const permissions = new Set(businessRoles.flatMap((role) => role.permissions));
      const linkedResourceIds = resourceIdsByUser.get(person.user_id) ?? new Set<string>();
      const dataScope = person.organization_role === "owner"
        || person.organization_role === "admin"
        || person.workspace_role === "admin"
        || permissions.has("*")
        ? "all"
        : [...permissions].some((permission) => TEAM_SCOPE_PERMISSIONS.has(permission))
          ? "team"
          : linkedResourceIds.size > 0
            ? "assigned"
            : permissions.size > 0
              ? "permitted"
              : "none";

      return {
        userId: person.user_id,
        displayName: person.display_name,
        email: person.email,
        avatarUrl: person.avatar_url,
        status: person.user_status,
        organizationRole: person.organization_role,
        workspaceRole: person.workspace_role,
        joinedAt: person.joined_at,
        businessRoles: businessRoles.map((group) => ({
          id: group.roleKey,
          packId: group.packIds[0] ?? "platform",
          packIds: group.packIds,
          groupKey: group.roleKey,
          label: group.label,
          description: group.description,
          permissions: group.permissions,
        })),
        resources: resources
          .filter((resource) => linkedResourceIds.has(resource.id))
          .map((resource) => ({ id: resource.id, name: resource.display_name, type: resource.resource_type })),
        dataScope,
        permissionCount: permissions.size,
      };
    });

    return successResponse(
      {
        canManage: true,
        workspaceId,
        organizationId: ctx.organizationId,
        currentUserId: currentUser?.id ?? null,
        currentOrganizationRole: ctx.organizationRole,
        members,
        roles: roles.map((role) => ({
          id: role.roleKey,
          packId: role.packIds[0] ?? "platform",
          packIds: role.packIds,
          groupKey: role.roleKey,
          label: role.label,
          description: role.description,
          permissions: role.permissions,
          assignedUserIds: roleAssignments.filter((assignment) => assignment.roleKey === role.roleKey).map((assignment) => assignment.userId),
        })),
        resources: resources.map((resource) => ({
          id: resource.id,
          name: resource.display_name,
          type: resource.resource_type,
          userId: resource.user_id,
        })),
      },
      200,
      ctx.requestId,
      "no-store"
    );
  } catch (error) {
    return handleError(error, requestId);
  }
}
