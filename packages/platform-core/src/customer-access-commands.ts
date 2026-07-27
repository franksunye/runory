// ── Customer Access Commands (v0.8 Batch 3, Tech Spec §5–§6) ──
//
// Per Tech Spec §5.1: customer_access.issue and customer_access.revoke are
// idempotent, audited, tenant-scoped Commands allowed only to user, api_key,
// system, and agent actors that pass normal Workspace authorization.
//
// Per Tech Spec §6.1: the raw token is generated as 32 random bytes encoded
// as base64url. Only SHA-256(rawToken) is persisted. The raw token is returned
// exactly once from issue and never logged, audited, or placed in a query
// string.

import { createHash, randomBytes } from "node:crypto";
import type { CustomerAccessCapability, CustomerAccessIssueInput } from "@runory/contracts";
import { genId, now, queryOne } from "./db";
import { TABLES } from "./contracts";
import { BusinessError, NotFoundError } from "./context";
import { ERROR_CODES } from "./errors";
import {
  executeCommand,
  checkOptimisticLock,
  type CommandActor,
  type CommandResult,
} from "./command-runtime";

export type { CommandActor } from "./command-runtime";

// ── Types ──

export interface CustomerAccessGrantRecord {
  id: string;
  workspace_id: string;
  subject_type: "contact" | "company";
  subject_id: string;
  root_object_type: "quote" | "work_order";
  root_record_id: string;
  capabilities_json: string;
  token_hash: string;
  status: "active" | "revoked" | "expired";
  expires_at: string;
  first_accessed_at: string | null;
  last_accessed_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_by: string;
  aggregate_version: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerAccessIssueResult {
  commandResult: CommandResult<CustomerAccessGrantRecord>;
  /** Raw token — returned exactly once. Never persisted or logged. */
  rawToken: string;
  /** Access URL for the customer. Uses fragment to keep token out of HTTP requests. */
  accessUrl: string;
}

// ── Token Utilities (Tech Spec §6.1) ──

/** Generate 32 random bytes encoded as base64url. */
export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash a raw token with SHA-256 for persistence. Only the hash is stored. */
export function hashAccessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ── Capability Validation (Tech Spec §5.2) ──

const VALID_CAPABILITIES: ReadonlySet<string> = new Set<CustomerAccessCapability>([
  "quote.view",
  "quote.accept",
  "work_order.view_status",
  "service_report.view",
  "invoice.view",
  "invoice.pay",
  "payment.view_status",
]);

export function validateCapabilities(
  capabilities: string[],
  rootObjectType: "quote" | "work_order",
): CustomerAccessCapability[] {
  const valid: CustomerAccessCapability[] = [];
  for (const cap of capabilities) {
    if (!VALID_CAPABILITIES.has(cap)) {
      throw new BusinessError(
        ERROR_CODES.INVALID_INPUT,
        `INVALID_INPUT: Unknown capability '${cap}'.`,
        400,
      );
    }
    // Root-object-type capability constraints
    if (rootObjectType === "quote") {
      if (cap === "work_order.view_status") {
        throw new BusinessError(
          ERROR_CODES.INVALID_INPUT,
        `INVALID_INPUT: Capability '${cap}' is not valid for root_object_type 'quote'.`,
          400,
        );
      }
    }
    if (rootObjectType === "work_order") {
      if (cap === "quote.view" || cap === "quote.accept") {
        throw new BusinessError(
          ERROR_CODES.INVALID_INPUT,
        `INVALID_INPUT: Capability '${cap}' is not valid for root_object_type 'work_order'.`,
          400,
        );
      }
    }
    valid.push(cap as CustomerAccessCapability);
  }
  return valid;
}

// ── Grant Expiry Validation (Tech Spec §6.1) ──

/** Maximum grant lifetime is 30 days. */
const MAX_GRANT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export function validateExpiry(expiresAt: string, nowMs: number = Date.now()): void {
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) {
    throw new BusinessError(
      ERROR_CODES.INVALID_INPUT,
      "INVALID_INPUT: expiresAt must be a valid ISO date string.",
      400,
    );
  }
  if (expiry <= nowMs) {
    throw new BusinessError(
      ERROR_CODES.INVALID_INPUT,
      "INVALID_INPUT: expiresAt must be in the future.",
      400,
    );
  }
  if (expiry - nowMs > MAX_GRANT_LIFETIME_MS) {
    throw new BusinessError(
      ERROR_CODES.INVALID_INPUT,
      "INVALID_INPUT: Grant lifetime must not exceed 30 days.",
      400,
    );
  }
}

// ── Read Grant ──

export async function readGrant(
  workspaceId: string,
  grantId: string,
): Promise<CustomerAccessGrantRecord> {
  const row = await queryOne<CustomerAccessGrantRecord>(
    `SELECT * FROM ${TABLES.customerAccessGrants}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, grantId],
  );
  if (!row) {
    throw new NotFoundError(`Customer access grant not found: ${grantId}`);
  }
  return row;
}

// ── Issue Command (Tech Spec §5.1, §6.1) ──

export async function issueCustomerAccessGrant(
  workspaceId: string,
  actor: CommandActor,
  input: CustomerAccessIssueInput,
  publicBaseUrl: string,
  commandId?: string,
): Promise<CustomerAccessIssueResult> {
  // Validate capabilities against root object type
  const validatedCapabilities = validateCapabilities(
    input.capabilities,
    input.rootObjectType,
  );

  // Validate expiry
  validateExpiry(input.expiresAt);

  // Generate raw token and hash
  const rawToken = generateAccessToken();
  const tokenHash = hashAccessToken(rawToken);

  const grantId = genId("cag");

  const commandResult = await executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "customer_access.issue",
      aggregateType: "customer_access_grant",
      aggregateId: grantId,
      expectedVersion: null,
      actor,
      input: {
        ...input,
        capabilities: validatedCapabilities,
      },
      occurredAt: now(),
    },
    async (envelope) => {
      const ts = envelope.occurredAt;
      const capabilitiesJson = JSON.stringify(validatedCapabilities);

      const statements = [
        {
          sql: `INSERT INTO ${TABLES.customerAccessGrants}
                (id, workspace_id, subject_type, subject_id, root_object_type, root_record_id,
                 capabilities_json, token_hash, status, expires_at,
                 first_accessed_at, last_accessed_at, revoked_at, revoked_by,
                 created_by, aggregate_version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, NULL, NULL, NULL, ?, 1, ?, ?)`,
          args: [
            grantId, workspaceId, input.subjectType, input.subjectId,
            input.rootObjectType, input.rootRecordId,
            capabilitiesJson, tokenHash, input.expiresAt,
            actor.id, ts, ts,
          ],
          expectedRowsAffected: 1,
        },
      ];

      return {
        statements,
        events: [
          {
            aggregateType: "customer_access_grant",
            aggregateId: grantId,
            eventType: "customer_access.issued",
            payload: {
              subjectType: input.subjectType,
              subjectId: input.subjectId,
              rootObjectType: input.rootObjectType,
              rootRecordId: input.rootRecordId,
              expiresAt: input.expiresAt,
              // NOTE: rawToken and tokenHash are intentionally NOT included
            },
          },
        ],
        audit: {
          action: "customer_access.issue",
          entityType: "customer_access_grant",
          entityId: grantId,
          after: {
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            rootObjectType: input.rootObjectType,
            rootRecordId: input.rootRecordId,
            capabilities: validatedCapabilities,
            expiresAt: input.expiresAt,
            // NOTE: tokenHash and rawToken are NOT included in audit
          },
        },
        aggregate: {
          id: grantId,
          workspace_id: workspaceId,
          subject_type: input.subjectType,
          subject_id: input.subjectId,
          root_object_type: input.rootObjectType,
          root_record_id: input.rootRecordId,
          capabilities_json: capabilitiesJson,
          token_hash: tokenHash,
          status: "active",
          expires_at: input.expiresAt,
          first_accessed_at: null,
          last_accessed_at: null,
          revoked_at: null,
          revoked_by: null,
          created_by: actor.id,
          aggregate_version: 1,
          created_at: ts,
          updated_at: ts,
        } as CustomerAccessGrantRecord,
        newVersion: 1,
      };
    },
  );

  // Build access URL using fragment per Tech Spec §6.1
  const accessUrl = `${publicBaseUrl}/access#token=${rawToken}`;

  return {
    commandResult,
    rawToken,
    accessUrl,
  };
}

// ── Revoke Command (Tech Spec §5.1) ──

export async function revokeCustomerAccessGrant(
  workspaceId: string,
  grantId: string,
  actor: CommandActor,
  expectedVersion: number,
  commandId?: string,
): Promise<CommandResult<CustomerAccessGrantRecord>> {
  return executeCommand(
    {
      commandId: commandId ?? genId("cmd"),
      workspaceId,
      commandType: "customer_access.revoke",
      aggregateType: "customer_access_grant",
      aggregateId: grantId,
      expectedVersion,
      actor,
      input: { grantId },
      occurredAt: now(),
    },
    async (envelope) => {
      const grant = await readGrant(workspaceId, grantId);
      checkOptimisticLock(grant.aggregate_version, expectedVersion);

      if (grant.status !== "active") {
        throw new BusinessError(
          ERROR_CODES.INVALID_TRANSITION,
          `INVALID_TRANSITION: Cannot revoke grant in status '${grant.status}'. Only 'active' grants can be revoked.`,
          409,
        );
      }

      const ts = envelope.occurredAt;
      const newVersion = grant.aggregate_version + 1;

      const statements = [
        {
          sql: `UPDATE ${TABLES.customerAccessGrants}
                SET status = 'revoked', revoked_at = ?, revoked_by = ?,
                    aggregate_version = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ? AND aggregate_version = ?`,
          args: [ts, actor.id, newVersion, ts, workspaceId, grantId, expectedVersion],
          expectedRowsAffected: 1,
        },
      ];

      return {
        statements,
        events: [
          {
            aggregateType: "customer_access_grant",
            aggregateId: grantId,
            eventType: "customer_access.revoked",
            payload: {
              revokedBy: actor.id,
            },
          },
        ],
        audit: {
          action: "customer_access.revoke",
          entityType: "customer_access_grant",
          entityId: grantId,
          before: { status: grant.status, aggregateVersion: grant.aggregate_version },
          after: { status: "revoked", aggregateVersion: newVersion },
        },
        aggregate: {
          ...grant,
          status: "revoked",
          revoked_at: ts,
          revoked_by: actor.id,
          aggregate_version: newVersion,
          updated_at: ts,
        },
        newVersion,
      };
    },
  );
}
