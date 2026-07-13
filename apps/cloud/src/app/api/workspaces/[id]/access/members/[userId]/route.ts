import { NextRequest } from "next/server";
import {
  _clearAccessCache,
  assignBusinessRole,
  execute,
  getBusinessRoles,
  getBusinessRoleAssignments,
  queryAll,
  removeBusinessRoleAssignment,
  removeWorkspaceAssignment,
  TABLES,
  updateOrganizationMemberRole,
  updateWorkspaceAssignment,
  writeAuditEvent,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";
import { successResponse, handleError, forbidden, invalidInput, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

type WorkspaceRole = "admin" | "member" | "viewer";

interface UpdateAccessBody {
  organizationRole?: "admin" | "member";
  workspaceRole?: WorkspaceRole | null;
  businessRoleIds?: string[];
  resourceIds?: string[];
}

function canManage(workspaceRole: string | null, organizationRole: string | null): boolean {
  return workspaceRole === "admin" || organizationRole === "owner" || organizationRole === "admin";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    const { id, userId } = await params;
    const { ctx, workspaceId } = await requireWorkspaceContext(request, id, "viewer");
    if (!canManage(ctx.workspaceRole, ctx.organizationRole) || !ctx.organizationId || !ctx.principal) {
      return forbidden("Workspace administrator access required", ctx.requestId);
    }

    const body = await request.json() as UpdateAccessBody;
    const managerOrganizationRole = ctx.organizationRole ?? (ctx.workspaceRole === "admin" ? "admin" : null);

    // Validate the entire requested state before applying any part of it. This
    // prevents a bad resource or role identifier from leaving a partial update.
    if (body.organizationRole !== undefined
      && (!ctx.organizationRole || !["admin", "member"].includes(body.organizationRole))) {
      return invalidInput("Invalid organization role", ctx.requestId);
    }
    if (body.workspaceRole !== undefined
      && body.workspaceRole !== null
      && !["admin", "member", "viewer"].includes(body.workspaceRole)) {
      return invalidInput("Invalid workspace role", ctx.requestId);
    }
    if (body.businessRoleIds !== undefined
      && (!Array.isArray(body.businessRoleIds) || body.businessRoleIds.some((id) => typeof id !== "string"))) {
      return invalidInput("Business role identifiers must be an array", ctx.requestId);
    }
    if (body.resourceIds !== undefined
      && (!Array.isArray(body.resourceIds) || body.resourceIds.some((id) => typeof id !== "string"))) {
      return invalidInput("Resource identifiers must be an array", ctx.requestId);
    }

    const manageBusinessRoles = body.businessRoleIds !== undefined || body.workspaceRole === null;
    const requestedRoleIds = body.workspaceRole === null ? [] : (body.businessRoleIds ?? []);
    const shouldLoadGroups = manageBusinessRoles || Boolean(body.resourceIds?.length);
    const groups = !shouldLoadGroups
      ? []
      : await getBusinessRoles(workspaceId);
    if (manageBusinessRoles) {
      const validIds = new Set(groups.map((group) => group.roleKey));
      if (requestedRoleIds.some((groupId) => !validIds.has(groupId))) {
        return invalidInput("A business role does not belong to this workspace", ctx.requestId);
      }
    }

    const technicianGroup = groups.find((group) => group.roleKey === "field_technician");
    const removingTechnicianRole = Boolean(
      manageBusinessRoles && technicianGroup && !requestedRoleIds.includes(technicianGroup.roleKey)
    );
    const manageResources = body.resourceIds !== undefined || body.workspaceRole === null || removingTechnicianRole;
    const requestedResourceIds = body.workspaceRole === null || removingTechnicianRole ? [] : (body.resourceIds ?? []);
    const resourcePlaceholders = requestedResourceIds.map(() => "?").join(",");
    if (manageResources && requestedResourceIds.length > 0) {
      const hasTechnicianRole = manageBusinessRoles
        ? Boolean(technicianGroup && requestedRoleIds.includes(technicianGroup.roleKey))
        : Boolean(technicianGroup && (await getBusinessRoleAssignments(workspaceId))
          .some((assignment) => assignment.roleKey === technicianGroup.roleKey && assignment.userId === userId));
      if (!hasTechnicianRole) {
        return invalidInput("A technician resource requires the Field Technician business role", ctx.requestId);
      }

      const validResources = await queryAll<{ id: string; user_id: string | null }>(
        `SELECT id, user_id FROM ${TABLES.resources}
         WHERE workspace_id = ? AND id IN (${resourcePlaceholders}) AND active = 1 AND resource_type = 'technician'`,
        [workspaceId, ...requestedResourceIds]
      );
      if (validResources.length !== new Set(requestedResourceIds).size) {
        return invalidInput("Only active technician resources from this workspace can be linked", ctx.requestId);
      }
      if (validResources.some((resource) => resource.user_id && resource.user_id !== userId)) {
        return invalidInput("A resource is already linked to another user", ctx.requestId);
      }
    }

    if (body.workspaceRole !== undefined) {
      const currentUser = await queryAll<{ id: string }>(
        `SELECT id FROM ${TABLES.users} WHERE id = ? OR external_id = ? LIMIT 1`,
        [ctx.principal.userId, ctx.principal.userId]
      ).then((rows) => rows[0] ?? null);
      if (currentUser?.id === userId) {
        return invalidInput("You cannot change your own workspace access", ctx.requestId);
      }
    }

    if (body.organizationRole !== undefined) {
      if (!ctx.organizationRole) {
        return forbidden("Organization administrator access required", ctx.requestId);
      }
      await updateOrganizationMemberRole(
        ctx.organizationId,
        userId,
        body.organizationRole,
        ctx.principal.userId,
        ctx.organizationRole
      );
      _clearAccessCache();
    }

    if (body.workspaceRole !== undefined) {
      if (body.workspaceRole === null) {
        await removeWorkspaceAssignment(ctx.organizationId, userId, workspaceId, managerOrganizationRole);
      } else if (["admin", "member", "viewer"].includes(body.workspaceRole)) {
        await updateWorkspaceAssignment(
          ctx.organizationId,
          userId,
          workspaceId,
          body.workspaceRole,
          ctx.principal.userId,
          managerOrganizationRole
        );
      }
      _clearAccessCache();
    }

    if (manageBusinessRoles) {
      const current = new Set((await getBusinessRoleAssignments(workspaceId))
        .filter((assignment) => assignment.userId === userId)
        .map((assignment) => assignment.roleKey));
      const desired = new Set(requestedRoleIds);
      for (const roleKey of desired) {
        if (!current.has(roleKey)) {
          await assignBusinessRole(workspaceId, roleKey, userId, ctx.principal.userId);
        }
      }
      for (const roleKey of current) {
        if (!desired.has(roleKey)) {
          await removeBusinessRoleAssignment(workspaceId, roleKey, userId);
        }
      }
    }

    if (manageResources) {
      await execute(
        `UPDATE ${TABLES.resources} SET user_id = NULL, updated_at = ? WHERE workspace_id = ? AND user_id = ?`,
        [new Date().toISOString(), workspaceId, userId]
      );
      if (requestedResourceIds.length > 0) {
        await execute(
          `UPDATE ${TABLES.resources} SET user_id = ?, updated_at = ? WHERE workspace_id = ? AND id IN (${resourcePlaceholders})`,
          [userId, new Date().toISOString(), workspaceId, ...requestedResourceIds]
        );
      }
    }

    await writeAuditEvent({
      workspaceId,
      actorType: "user",
      actorId: ctx.principal.userId,
      action: "record.update",
      entityType: "workspace_membership",
      entityId: userId,
      after: body as Record<string, unknown>,
      requestId: ctx.requestId,
    });

    return successResponse({ updated: true }, 200, ctx.requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
