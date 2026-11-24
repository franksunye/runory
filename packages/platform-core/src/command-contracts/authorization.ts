import type { CommandContract } from "@runory/contracts";
import { hasBusinessPermission, requireBusinessPermission, requireWorkspaceAccess } from "../authorization";
import { createRequestContext, BusinessError, type RequestContext } from "../context";
import { TABLES } from "../contracts";
import { queryOne, type BatchStatement } from "../db";
import { ERROR_CODES } from "../errors";
import { authorizeCustomerCommandActor } from "./customer-authorization";
import type { ResolvedCommandPlan } from "./types";

type ContractActor = {
  type: "user" | "api_key" | "system" | "agent" | "customer";
  id: string;
};

interface CommandAuthorizationTarget {
  aggregateType: string;
  aggregateId: string;
  source: ResolvedCommandPlan["source"];
}

interface CommandActorAuthorization {
  /** Recheck a resource-scoped grant inside the command's atomic write batch. */
  commitGuard: BatchStatement;
}

function permissionDenied(message: string): BusinessError {
  return new BusinessError(
    ERROR_CODES.PERMISSION_DENIED,
    `PERMISSION_DENIED: ${message}`,
    403,
  );
}

/**
 * FSM visit deliverables reuse the work-item storage and completion command,
 * without granting technicians authority over general Workflow operations.
 * This resource policy applies only to the built-in v1 completion Contract and
 * a persisted, directly assigned Visit requirement. Existing installations
 * already grant visit.execute + forms.submission.submit; no role rewrite or
 * implicit generic workflow permission is needed. This human-user policy does
 * not extend API key authority. Contract actor restrictions and Workspace write
 * access are checked first; API keys retain their normal scope/permission gates.
 * The handler still checks assignment, evidence, status, and expectedVersion.
 */
async function resolveAssignedVisitCompletionGuard(
  context: RequestContext,
  actor: ContractActor,
  contract: CommandContract,
  target?: CommandAuthorizationTarget,
): Promise<BatchStatement | undefined> {
  if (actor.type !== "user"
    || contract.key !== "work_item.complete"
    || contract.contractVersion !== "1.0.0"
    || contract.aggregate !== "work_item"
    || contract.permission !== "workflow.work_item.act"
    || target?.aggregateType !== "work_item"
    || target.source?.kind !== "platform_service"
    || target.source.id !== "runory.workflow"
    || target.source.version !== "1.0.0") return undefined;

  if (!await hasBusinessPermission(context, "visit.execute")
    || !await hasBusinessPermission(context, "forms.submission.submit")) return undefined;

  // Reuse this exact predicate for the read-time decision and commit-time
  // assertion. A cancellation, release, or reassignment after authorization
  // must not leave behind a success event/audit for an unauthorized write.
  const eligibleItemSql = `SELECT item.id
     FROM ${TABLES.workItems} item
     JOIN ${TABLES.visitExecutionRequirements} requirement
       ON requirement.workspace_id = item.workspace_id
      AND requirement.id = item.step_id
      AND requirement.visit_id = item.subject_id
      AND requirement.binding_id = item.form_binding_id
     JOIN ${TABLES.visitExecutionItems} execution
       ON execution.workspace_id = requirement.workspace_id
      AND execution.visit_id = requirement.visit_id
     JOIN ${TABLES.resources} resource
       ON resource.workspace_id = execution.workspace_id
      AND resource.id = execution.resource_id
     JOIN ${TABLES.assignments} assignment
       ON assignment.workspace_id = execution.workspace_id
      AND assignment.id = execution.assignment_id
      AND assignment.resource_id = resource.id
      AND assignment.subject_type = 'service_visit'
      AND assignment.subject_id = requirement.visit_id
     WHERE item.workspace_id = ? AND item.id = ?
       AND item.kind = 'human_task' AND item.subject_type = 'service_visit'
       AND item.instance_id = 'visit_execution:' || requirement.visit_id
       AND item.assignee_type = 'user' AND item.assignee_id = ?
       AND resource.active = 1 AND resource.user_id = ?
       AND assignment.status IN ('assigned', 'accepted')
       AND (execution.status IN ('ready', 'active')
         OR (execution.status = 'completed' AND item.status = 'completed'))`;
  const args = [context.workspaceId!, target.aggregateId, context.principal!.userId, context.principal!.userId];
  if (!await queryOne<{ id: string }>(eligibleItemSql, args)) return undefined;
  return {
    sql: `UPDATE ${TABLES.workItems} SET id = id WHERE id IN (${eligibleItemSql})`,
    args,
    expectedRowsAffected: 1,
  };
}

/**
 * Authorize a Command from its persisted Contract at the Runtime boundary.
 *
 * System actors represent trusted in-process services. Human, API-key, and
 * future Agent actors must resolve to an active Workspace/Organization member
 * and pass the existing business-permission policy.
 *
 * Customer actors (Tech Spec §7) are resolved through a dedicated branch that
 * verifies an active, unexpired customer-access grant and capability match —
 * they are never treated as Workspace members.
 */
export async function authorizeCommandActor(
  workspaceId: string,
  actor: ContractActor,
  contract: CommandContract,
  target?: CommandAuthorizationTarget,
): Promise<CommandActorAuthorization | void> {
  if (!contract.allowedActorTypes.includes(actor.type)) {
    throw permissionDenied(
      `Actor type '${actor.type}' is not allowed to execute '${contract.key}'.`,
    );
  }
  if (actor.type === "system") return;

  // Customer actors delegate to the customer-access authorization branch.
  // They must never resolve as Workspace members (Tech Spec §7.2).
  if (actor.type === "customer") {
    await authorizeCustomerCommandActor(workspaceId, actor.id, contract);
    return;
  }

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
  if (await hasBusinessPermission(context, contract.permission)) return;
  const commitGuard = await resolveAssignedVisitCompletionGuard(context, actor, contract, target);
  if (commitGuard) return { commitGuard };
  await requireBusinessPermission(context, contract.permission);
}
