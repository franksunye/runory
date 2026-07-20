import type { CommandContract } from "@runory/contracts";
import { requireBusinessPermission, requireWorkspaceAccess } from "../authorization";
import { createRequestContext, BusinessError } from "../context";
import { TABLES } from "../contracts";
import { queryOne } from "../db";
import { ERROR_CODES } from "../errors";

type ContractActor = {
  type: "user" | "api_key" | "system" | "agent";
  id: string;
};

function permissionDenied(message: string): BusinessError {
  return new BusinessError(
    ERROR_CODES.PERMISSION_DENIED,
    `PERMISSION_DENIED: ${message}`,
    403,
  );
}

/**
 * Authorize a Command from its persisted Contract at the Runtime boundary.
 *
 * System actors represent trusted in-process services. Human, API-key, and
 * future Agent actors must resolve to an active Workspace/Organization member
 * and pass the existing business-permission policy.
 */
export async function authorizeCommandActor(
  workspaceId: string,
  actor: ContractActor,
  contract: CommandContract,
): Promise<void> {
  if (!contract.allowedActorTypes.includes(actor.type)) {
    throw permissionDenied(
      `Actor type '${actor.type}' is not allowed to execute '${contract.key}'.`,
    );
  }
  if (actor.type === "system") return;

  const identity = await queryOne<{
    user_id: string | null;
    email: string | null;
    display_name: string | null;
    workspace_role: "admin" | "member" | "viewer" | null;
    organization_id: string | null;
    organization_role: "owner" | "admin" | "member" | null;
  }>(
    `SELECT u.id AS user_id, u.email, u.display_name,
            wm.role AS workspace_role,
            wt.organization_id,
            om.role AS organization_role
     FROM ${TABLES.workspaces} w
     LEFT JOIN ${TABLES.workspaceTenants} wt ON wt.workspace_id = w.id
     LEFT JOIN ${TABLES.users} u
       ON (u.id = ? OR u.external_id = ?) AND u.status = 'active'
     LEFT JOIN ${TABLES.workspaceMemberships} wm
       ON wm.workspace_id = w.id AND wm.user_id = u.id AND wm.status = 'active'
     LEFT JOIN ${TABLES.organizationMemberships} om
       ON om.organization_id = wt.organization_id
      AND om.user_id = u.id AND om.status = 'active'
     WHERE w.id = ?
     LIMIT 1`,
    [actor.id, actor.id, workspaceId],
  );
  if (!identity?.user_id) {
    throw permissionDenied(
      `Actor '${actor.id}' is not an active user for Workspace '${workspaceId}'.`,
    );
  }

  const context = createRequestContext({
    principal: {
      userId: identity.user_id,
      email: identity.email,
      displayName: identity.display_name ?? actor.id,
      authMethod: actor.type === "api_key" ? "api_key" : "trust_headers",
    },
    organizationId: identity.organization_id,
    workspaceId,
    organizationRole: identity.organization_role,
    workspaceRole: identity.workspace_role,
  });
  try {
    requireWorkspaceAccess(context, "write");
  } catch {
    throw permissionDenied(
      `Actor '${actor.id}' does not have write access to Workspace '${workspaceId}'.`,
    );
  }
  await requireBusinessPermission(context, contract.permission);
}
