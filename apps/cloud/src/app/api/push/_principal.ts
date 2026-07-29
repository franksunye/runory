/**
 * v0.9.2 PWA Notification — Shared push principal resolver.
 *
 * Spec: v0.9 PWA Notification Technical Spec §5 (Principal and subscription contract)
 *
 * Derives the push principal from the authenticated session. The principal type
 * and ID are always server-derived, never caller-supplied.
 *
 * Two principal classes are supported:
 *   1. customer_access_grant — resolved from the customer-access cookie
 *   2. workspace_membership   — resolved from the workspace session; requires
 *      a `w` query parameter (workspace slug or ID)
 */

import type { NextRequest } from "next/server";
import {
  resolveCustomerAccessSession,
  CUSTOMER_ACCESS_COOKIE_NAME,
  queryOne,
  TABLES,
  getOrCreateRequestId,
  AuthenticationError,
  type PushPrincipalType,
} from "@runory/platform-core";
import { requireWorkspaceContext } from "@/lib/auth";

export interface ResolvedPushPrincipal {
  workspaceId: string;
  principalType: PushPrincipalType;
  principalId: string;
  requestId: string;
}

/**
 * Resolve the push principal from either a customer-access session or a
 * workspace session.
 *
 * Customer-access principals are resolved first from the customer-access
 * cookie. If no valid customer-access session is found, the function falls
 * back to workspace session authentication, which requires a `w` query
 * parameter containing the workspace slug or ID.
 */
export async function resolvePushPrincipal(
  request: NextRequest,
): Promise<ResolvedPushPrincipal> {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));

  // 1. Try customer-access session (cookie-based)
  const customerAccessCookie = request.cookies.get(CUSTOMER_ACCESS_COOKIE_NAME)?.value;
  if (customerAccessCookie) {
    const grant = await resolveCustomerAccessSession(customerAccessCookie);
    if (grant) {
      return {
        workspaceId: grant.workspace_id,
        principalType: "customer_access_grant",
        principalId: grant.id,
        requestId,
      };
    }
  }

  // 2. Fall back to workspace session (query param `w`)
  const url = new URL(request.url);
  const workspaceReference = url.searchParams.get("w");
  if (!workspaceReference) {
    throw new AuthenticationError(
      "Workspace reference (`w` query parameter) is required for system-user push access",
    );
  }

  const { ctx, workspaceId } = await requireWorkspaceContext(
    request,
    workspaceReference,
    "viewer",
  );

  const userId = ctx.principal?.userId;
  if (!userId) {
    throw new AuthenticationError("Authenticated principal is required");
  }

  // Resolve the workspace_membership ID for this user. The principal's userId
  // may be either the saas_users.id or the external_id, so we join on both
  // (mirroring authorizeWorkspace / authorizeOrganization in lib/auth.ts).
  const membership = await queryOne<{ id: string }>(
    `SELECT wm.id
     FROM ${TABLES.workspaceMemberships} wm
     JOIN ${TABLES.users} u ON u.id = wm.user_id AND u.status = 'active'
     WHERE wm.workspace_id = ? AND (u.id = ? OR u.external_id = ?) AND wm.status = 'active'`,
    [workspaceId, userId, userId],
  );
  if (!membership) {
    throw new AuthenticationError("Active workspace membership not found");
  }

  return {
    workspaceId,
    principalType: "workspace_membership",
    principalId: membership.id,
    requestId: ctx.requestId,
  };
}
