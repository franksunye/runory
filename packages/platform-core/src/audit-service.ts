import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import {
  type Principal,
  type RequestContext,
  AuthenticationError,
  AuthorizationError,
} from "./context";

// ── Audit Event Types ──

export type AuditAction =
  | "user.create"
  | "user.delete"
  | "session.create"
  | "session.revoke"
  | "organization.create"
  | "organization.delete"
  | "workspace.create"
  | "workspace.archive"
  | "workspace.delete"
  | "workspace.restore"
  | "workspace.purge"
  | "workspace.export"
  | "member.invite"
  | "member.accept"
  | "member.remove"
  | "member.role_change"
  | "ownership.transfer"
  | "invitation.create"
  | "invitation.revoke"
  | "invitation.resend"
  | "api_key.create"
  | "api_key.revoke"
  | "api_key.rotate"
  | "api_key.use"
  | "extension.apply"
  | "extension.rollback"
  | "record.create"
  | "record.update"
  | "record.delete"
  | "entitlement.update"
  | "quota.exceeded"
  // Catalog & Release Control Plane (docs/09 §17)
  | "catalog.candidate_import"
  | "catalog.version_freeze"
  | "catalog.version_reject"
  | "catalog.validation_run"
  | "catalog.release_promote"
  | "catalog.release_deprecate"
  | "catalog.release_withdraw"
  | "catalog.rollout_create"
  | "catalog.rollout_pause"
  | "catalog.rollout_resume"
  | "catalog.rollout_cancel"
  | "module.install"
  | "module.upgrade"
  | "module.upgrade_failed"
  | "module.compatibility_override";

export interface AuditEventInput {
  workspaceId: string;
  actorType: "user" | "api_key" | "system" | "agent";
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  extensionVersionId?: string | null;
  requestId?: string | null;
}

export interface AuditEvent extends AuditEventInput {
  id: string;
  createdAt: string;
}

// ── Sensitive fields to redact ──

const SENSITIVE_FIELDS = new Set([
  "password", "token", "secret", "otp", "code", "session_token",
  "key_hash", "key", "api_key", "authorization", "cookie",
  "challenge", "hash", "refresh_token",
]);

function redactSensitive(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

// ── Write Audit Event (append-only) ──

export async function writeAuditEvent(input: AuditEventInput): Promise<string> {
  const id = genId("aud");
  const ts = now();
  const before = redactSensitive(input.before ?? null);
  const after = redactSensitive(input.after ?? null);

  await execute(
    `INSERT INTO ${TABLES.auditLogs}
     (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, extension_version_id, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.workspaceId,
      input.actorType,
      input.actorId,
      input.action,
      input.entityType,
      input.entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      input.extensionVersionId ?? null,
      input.requestId ?? null,
      ts,
    ]
  );

  return id;
}

// ── Query Audit Events ──

export async function getAuditEvents(
  workspaceId: string,
  options?: {
    action?: string;
    actorId?: string;
    entityType?: string;
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }
): Promise<AuditEvent[]> {
  const conditions = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (options?.action) {
    conditions.push("action = ?");
    args.push(options.action);
  }
  if (options?.actorId) {
    conditions.push("actor_id = ?");
    args.push(options.actorId);
  }
  if (options?.entityType) {
    conditions.push("entity_type = ?");
    args.push(options.entityType);
  }
  if (options?.startDate) {
    conditions.push("created_at >= ?");
    args.push(options.startDate);
  }
  if (options?.endDate) {
    conditions.push("created_at <= ?");
    args.push(options.endDate);
  }

  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;
  args.push(limit, offset);

  const rows = await queryAll<{
    id: string; workspace_id: string; actor_type: string; actor_id: string;
    action: string; entity_type: string; entity_id: string;
    before_json: string | null; after_json: string | null;
    extension_version_id: string | null; request_id: string | null; created_at: string;
  }>(
    `SELECT * FROM ${TABLES.auditLogs} WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args
  );

  return rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    actorType: r.actor_type as AuditEventInput["actorType"],
    actorId: r.actor_id,
    action: r.action as AuditAction,
    entityType: r.entity_type,
    entityId: r.entity_id,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    extensionVersionId: r.extension_version_id,
    requestId: r.request_id,
    createdAt: r.created_at,
  }));
}

// ── Find audit events by request ID ──

export async function findAuditByRequestId(
  requestId: string,
  workspaceId?: string
): Promise<AuditEvent[]> {
  const conditions = ["request_id = ?"];
  const args: unknown[] = [requestId];

  if (workspaceId) {
    conditions.push("workspace_id = ?");
    args.push(workspaceId);
  }

  const rows = await queryAll<{
    id: string; workspace_id: string; actor_type: string; actor_id: string;
    action: string; entity_type: string; entity_id: string;
    before_json: string | null; after_json: string | null;
    extension_version_id: string | null; request_id: string | null; created_at: string;
  }>(
    `SELECT * FROM ${TABLES.auditLogs} WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    args
  );

  return rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    actorType: r.actor_type as AuditEventInput["actorType"],
    actorId: r.actor_id,
    action: r.action as AuditAction,
    entityType: r.entity_type,
    entityId: r.entity_id,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    extensionVersionId: r.extension_version_id,
    requestId: r.request_id,
    createdAt: r.created_at,
  }));
}

// ── Retention: delete audit events older than 365 days ──

export async function cleanupOldAuditEvents(retentionDays = 365): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  await execute(
    `DELETE FROM ${TABLES.auditLogs} WHERE created_at < ?`,
    [cutoff]
  );
}
