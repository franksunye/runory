/**
 * v0.9.2 PWA Notification — Push subscription repository.
 *
 * Spec: v0.9 PWA Notification Technical Spec §5 (Principal and subscription contract)
 *
 * Invariants:
 * - endpoint and key material are sensitive; never returned in diagnostics or logs
 * - uniqueness: one active subscription per (workspace, principal, endpoint_hash)
 * - principal_type + principal_id derive from authenticated session, never caller-supplied
 * - customer-access subscriptions are revoked when their grant is revoked or expired
 * - provider 404/410 marks subscription expired
 */

import { createHash } from "node:crypto";
import { TABLES } from "./contracts";
import { query, queryAll, queryOne, execute, genId, now } from "./db";

// ── Types ──

export type PushPrincipalType = "workspace_membership" | "customer_access_grant";
export type PushSubscriptionStatus = "active" | "disabled" | "expired" | "revoked";

export interface PushSubscriptionRecord {
  id: string;
  workspaceId: string;
  principalType: PushPrincipalType;
  principalId: string;
  endpointHash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgentSummary: string | null;
  status: PushSubscriptionStatus;
  createdAt: string;
  lastVerifiedAt: string | null;
  lastAcceptedAt: string | null;
  lastErrorCode: string | null;
}

export interface PushSubscriptionInput {
  workspaceId: string;
  principalType: PushPrincipalType;
  principalId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgentSummary?: string;
}

export interface PushSubscriptionSafe {
  id: string;
  status: PushSubscriptionStatus;
  createdAt: string;
  lastVerifiedAt: string | null;
  lastAcceptedAt: string | null;
  lastErrorCode: string | null;
}

// ── Helpers ──

export function hashEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function toSafe(row: PushSubscriptionRecord): PushSubscriptionSafe {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    lastVerifiedAt: row.lastVerifiedAt,
    lastAcceptedAt: row.lastAcceptedAt,
    lastErrorCode: row.lastErrorCode,
  };
}

function mapRow(row: Record<string, unknown>): PushSubscriptionRecord {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    principalType: row.principal_type as PushPrincipalType,
    principalId: row.principal_id as string,
    endpointHash: row.endpoint_hash as string,
    endpoint: row.endpoint as string,
    p256dh: row.p256dh as string,
    auth: row.auth as string,
    userAgentSummary: (row.user_agent_summary as string) || null,
    status: row.status as PushSubscriptionStatus,
    createdAt: row.created_at as string,
    lastVerifiedAt: (row.last_verified_at as string) || null,
    lastAcceptedAt: (row.last_accepted_at as string) || null,
    lastErrorCode: (row.last_error_code as string) || null,
  };
}

// ── Repository ──

export async function createPushSubscription(
  input: PushSubscriptionInput,
): Promise<PushSubscriptionRecord> {
  const endpointHash = hashEndpoint(input.endpoint);
  const id = genId("push_sub");
  const ts = now();

  // Upsert: if a subscription with the same endpoint_hash exists for this
  // principal, reactivate it with new keys.
  const existing = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM ${TABLES.pushSubscriptions}
     WHERE workspace_id = ? AND principal_type = ? AND principal_id = ? AND endpoint_hash = ?`,
    [input.workspaceId, input.principalType, input.principalId, endpointHash],
  );

  if (existing) {
    await execute(
      `UPDATE ${TABLES.pushSubscriptions}
       SET endpoint = ?, p256dh = ?, auth = ?, user_agent_summary = ?,
           status = 'active', last_verified_at = ?, last_error_code = NULL
       WHERE id = ?`,
      [input.endpoint, input.p256dh, input.auth, input.userAgentSummary || null, ts, existing.id],
    );
    const updated = await getPushSubscriptionById(existing.id);
    if (!updated) throw new Error("PUSH_SUBSCRIPTION_UPDATE_FAILED");
    return updated;
  }

  await execute(
    `INSERT INTO ${TABLES.pushSubscriptions}
       (id, workspace_id, principal_type, principal_id, endpoint_hash,
        endpoint, p256dh, auth, user_agent_summary, status, created_at, last_verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [id, input.workspaceId, input.principalType, input.principalId, endpointHash,
     input.endpoint, input.p256dh, input.auth, input.userAgentSummary || null, ts, ts],
  );

  const created = await getPushSubscriptionById(id);
  if (!created) throw new Error("PUSH_SUBSCRIPTION_CREATE_FAILED");
  return created;
}

export async function getPushSubscriptionById(id: string): Promise<PushSubscriptionRecord | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.pushSubscriptions} WHERE id = ?`,
    [id],
  );
  return row ? mapRow(row) : null;
}

export async function getActiveSubscriptionsForPrincipal(
  workspaceId: string,
  principalType: PushPrincipalType,
  principalId: string,
): Promise<PushSubscriptionRecord[]> {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.pushSubscriptions}
     WHERE workspace_id = ? AND principal_type = ? AND principal_id = ? AND status = 'active'
     ORDER BY created_at DESC`,
    [workspaceId, principalType, principalId],
  );
  return rows.map(mapRow);
}

export async function getActiveSubscriptionsForWorkspace(
  workspaceId: string,
): Promise<PushSubscriptionRecord[]> {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.pushSubscriptions}
     WHERE workspace_id = ? AND status = 'active'
     ORDER BY created_at DESC`,
    [workspaceId],
  );
  return rows.map(mapRow);
}

export async function disablePushSubscription(
  id: string,
): Promise<void> {
  await execute(
    `UPDATE ${TABLES.pushSubscriptions} SET status = 'disabled' WHERE id = ?`,
    [id],
  );
}

export async function revokePushSubscriptionsForPrincipal(
  workspaceId: string,
  principalType: PushPrincipalType,
  principalId: string,
): Promise<number> {
  const result = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.pushSubscriptions}
     WHERE workspace_id = ? AND principal_type = ? AND principal_id = ? AND status = 'active'`,
    [workspaceId, principalType, principalId],
  );
  const count = result?.count ?? 0;

  await execute(
    `UPDATE ${TABLES.pushSubscriptions}
     SET status = 'revoked'
     WHERE workspace_id = ? AND principal_type = ? AND principal_id = ? AND status = 'active'`,
    [workspaceId, principalType, principalId],
  );

  return count;
}

export async function expirePushSubscription(
  id: string,
  errorCode: string,
): Promise<void> {
  await execute(
    `UPDATE ${TABLES.pushSubscriptions}
     SET status = 'expired', last_error_code = ?
     WHERE id = ?`,
    [errorCode, id],
  );
}

export async function markPushSubscriptionAccepted(id: string): Promise<void> {
  await execute(
    `UPDATE ${TABLES.pushSubscriptions}
     SET last_accepted_at = ?, last_verified_at = ?, last_error_code = NULL
     WHERE id = ?`,
    [now(), now(), id],
  );
}

export async function markPushSubscriptionFailed(id: string, errorCode: string): Promise<void> {
  await execute(
    `UPDATE ${TABLES.pushSubscriptions}
     SET last_error_code = ?, last_verified_at = ?
     WHERE id = ?`,
    [errorCode, now(), id],
  );
}

export async function getSubscriptionByEndpoint(
  workspaceId: string,
  endpoint: string,
): Promise<PushSubscriptionRecord | null> {
  const endpointHash = hashEndpoint(endpoint);
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.pushSubscriptions}
     WHERE workspace_id = ? AND endpoint_hash = ?`,
    [workspaceId, endpointHash],
  );
  return row ? mapRow(row) : null;
}

export async function getPushSubscriptionStats(
  workspaceId: string,
): Promise<{ active: number; disabled: number; expired: number; revoked: number }> {
  const rows = await queryAll<{ status: string; count: number }>(
    `SELECT status, COUNT(*) as count FROM ${TABLES.pushSubscriptions}
     WHERE workspace_id = ?
     GROUP BY status`,
    [workspaceId],
  );
  const stats = { active: 0, disabled: 0, expired: 0, revoked: 0 };
  for (const r of rows) {
    if (r.status in stats) stats[r.status as keyof typeof stats] = r.count;
  }
  return stats;
}

export function toSafeSubscription(sub: PushSubscriptionRecord): PushSubscriptionSafe {
  return toSafe(sub);
}
