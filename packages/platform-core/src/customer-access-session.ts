// ── Customer Access Session (v0.8 Batch 3, Tech Spec §6) ──
//
// Per Tech Spec §6.2: the exchange endpoint creates a signed, opaque
// customer-access session cookie containing grant ID and issued/expiry times.
// The cookie is signed with a dedicated CUSTOMER_ACCESS_SESSION_SECRET and
// bounded to the grant expiry.
//
// Per Tech Spec §6.3: every customer-access response sets Cache-Control:
// private, no-store; Referrer-Policy: no-referrer; X-Robots-Tag: noindex,
// nofollow. Public errors do not distinguish missing, expired, revoked, or
// mismatched records.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { queryOne, batch } from "./db";
import { TABLES, businessTable } from "./contracts";
import { hashAccessToken } from "./customer-access-commands";
import type { CustomerAccessGrantRecord } from "./customer-access-commands";
import { writeAuditEvent } from "./audit-service";

// ── Session Cookie ──

export const CUSTOMER_ACCESS_COOKIE_NAME = "runory_customer_access";

export interface CustomerAccessSessionPayload {
  grantId: string;
  workspaceId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface CustomerAccessCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge: number;
}

/**
 * Get the session secret from the environment. Throws if not configured.
 * Per Tech Spec §6.2, the cookie is signed with a dedicated
 * CUSTOMER_ACCESS_SESSION_SECRET.
 */
export function getCustomerAccessSessionSecret(): string {
  const secret = process.env.CUSTOMER_ACCESS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "CUSTOMER_ACCESS_SESSION_SECRET_NOT_CONFIGURED: Customer access session secret must be at least 32 characters.",
    );
  }
  return secret;
}

/**
 * Create a signed session cookie value from a grant.
 * The cookie payload is base64url(JSON({grantId, workspaceId, issuedAt, expiresAt})).
 * The signature is HMAC-SHA256(payload, secret).
 * Cookie value format: `{payload}.{signature}`
 */
export function createCustomerAccessSession(
  grant: CustomerAccessGrantRecord,
  nowMs: number = Date.now(),
): string {
  const secret = getCustomerAccessSessionSecret();
  const payload: CustomerAccessSessionPayload = {
    grantId: grant.id,
    workspaceId: grant.workspace_id,
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: grant.expires_at,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payloadB64, "utf-8").digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Verify a signed session cookie value and return the payload.
 * Returns null if the signature is invalid or the cookie is malformed.
 */
export function verifyCustomerAccessSession(cookieValue: string): CustomerAccessSessionPayload | null {
  const secret = getCustomerAccessSessionSecret();
  const dotIndex = cookieValue.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payloadB64 = cookieValue.substring(0, dotIndex);
  const providedSignature = cookieValue.substring(dotIndex + 1);

  const expectedSignature = createHmac("sha256", secret).update(payloadB64, "utf-8").digest("base64url");

  // Timing-safe comparison
  const provided = Buffer.from(providedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson) as CustomerAccessSessionPayload;
    if (!payload.grantId || !payload.workspaceId || !payload.issuedAt || !payload.expiresAt) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Cookie options for the customer access session.
 * Per Tech Spec §6.2: HttpOnly, Secure in non-local, SameSite=Lax, Path=/.
 * Cookie expiry is bounded to grant expiry.
 */
export function customerAccessCookieOptions(grantExpiresAt: string): CustomerAccessCookieOptions {
  const maxAge = Math.max(0, Math.floor((new Date(grantExpiresAt).getTime() - Date.now()) / 1000));
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/**
 * Expired cookie options for clearing the session.
 */
export function expiredCustomerAccessCookieOptions(): CustomerAccessCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}

// ── Token Exchange (Tech Spec §6.2) ──

export interface TokenExchangeResult {
  grant: CustomerAccessGrantRecord;
  cookieValue: string;
  cookieOptions: CustomerAccessCookieOptions;
}

/**
 * A safe "unavailable" result that does not distinguish between missing,
 * expired, revoked, or mismatched grants (Tech Spec §6.3).
 */
export class CustomerAccessUnavailableError extends Error {
  constructor() {
    super("UNAVAILABLE: Customer access is not available.");
    this.name = "CustomerAccessUnavailableError";
  }
}

/**
 * Exchange a raw token for a customer access session.
 *
 * Per Tech Spec §6.2:
 * 1. Hash and look up the token
 * 2. Verify expiry, revocation, root, subject, and Workspace status
 * 3. Create a signed session cookie
 * 4. Bound cookie expiry to grant expiry
 * 5. Update first/last access timestamps
 * 6. Return no raw business data
 *
 * All failure cases throw CustomerAccessUnavailableError to avoid leaking
 * information about the specific failure reason.
 */
export async function exchangeCustomerAccessToken(
  rawToken: string,
  nowMs: number = Date.now(),
): Promise<TokenExchangeResult> {
  if (!rawToken || rawToken.length < 10) {
    throw new CustomerAccessUnavailableError();
  }

  const tokenHash = hashAccessToken(rawToken);

  const grant = await queryOne<CustomerAccessGrantRecord>(
    `SELECT * FROM ${TABLES.customerAccessGrants} WHERE token_hash = ?`,
    [tokenHash],
  );

  if (!grant) {
    throw new CustomerAccessUnavailableError();
  }

  // Verify status — revoked or expired grants are unavailable
  if (grant.status === "revoked" || grant.revoked_at) {
    throw new CustomerAccessUnavailableError();
  }

  // Verify expiry
  const expiresAtMs = new Date(grant.expires_at).getTime();
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= nowMs) {
    throw new CustomerAccessUnavailableError();
  }

  // Per Tech Spec §6.2: verify root record, subject record, and workspace
  // are still in a valid state. All failures collapse to UNAVAILABLE.
  await verifyGrantContext(grant);

  // Update first/last accessed timestamps
  const nowIso = new Date(nowMs).toISOString();
  const isFirstAccess = grant.first_accessed_at === null;
  await batch([
    {
      sql: `UPDATE ${TABLES.customerAccessGrants}
            SET first_accessed_at = COALESCE(first_accessed_at, ?),
                last_accessed_at = ?,
                updated_at = ?
            WHERE workspace_id = ? AND id = ?`,
      args: [nowIso, nowIso, nowIso, grant.workspace_id, grant.id],
    },
  ]);

  // Create signed session cookie
  const cookieValue = createCustomerAccessSession(grant, nowMs);
  const cookieOptions = customerAccessCookieOptions(grant.expires_at);

  return { grant, cookieValue, cookieOptions };
}

/**
 * Verify that the grant's root record, subject record, and workspace are
 * still in a valid state for customer access.
 *
 * Per Tech Spec §6.2: token exchange must verify root, subject, and
 * Workspace status — not just grant status and expiry.
 *
 * All failures throw CustomerAccessUnavailableError to avoid leaking
 * information about the specific failure reason.
 */
async function verifyGrantContext(grant: CustomerAccessGrantRecord): Promise<void> {
  // 1. Verify workspace exists and is active
  //    The workspaces table uses `status` (default 'active') and soft-delete
  //    columns `archived_at` / `pending_deletion_at` / `purged_at` — not
  //    `deleted_at` like business tables.
  const workspace = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM ${TABLES.workspaces} WHERE id = ?`,
    [grant.workspace_id],
  );
  if (!workspace || workspace.status !== "active") {
    throw new CustomerAccessUnavailableError();
  }

  // 2. Verify root record exists and is in a valid state for customer access
  //    Quotes in 'sent' or 'accepted' status are valid for customer access.
  //    Work orders in active statuses are valid for customer access.
  const rootTable = businessTable(grant.root_object_type);
  const rootStatusColumn = grant.root_object_type === "quote" ? "status" : "status";
  const root = await queryOne<{ id: string; status: string; deleted_at: string | null }>(
    `SELECT id, ${rootStatusColumn} AS status, deleted_at FROM ${rootTable}
     WHERE workspace_id = ? AND id = ?`,
    [grant.workspace_id, grant.root_record_id],
  );
  if (!root || root.deleted_at) {
    throw new CustomerAccessUnavailableError();
  }
  // Valid root statuses: sent, accepted (quote); any non-cancelled (work_order)
  if (grant.root_object_type === "quote") {
    if (!["sent", "accepted"].includes(root.status)) {
      throw new CustomerAccessUnavailableError();
    }
  } else {
    if (root.status === "cancelled" || root.status === "closed") {
      throw new CustomerAccessUnavailableError();
    }
  }

  // 3. Verify subject record exists
  const subjectTable = businessTable(grant.subject_type);
  const subject = await queryOne<{ id: string; deleted_at: string | null }>(
    `SELECT id, deleted_at FROM ${subjectTable}
     WHERE workspace_id = ? AND id = ?`,
    [grant.workspace_id, grant.subject_id],
  );
  if (!subject || subject.deleted_at) {
    throw new CustomerAccessUnavailableError();
  }
}

// ── Session Resolution ──

/**
 * Resolve a customer access session from a cookie value.
 * Verifies the signature and checks that the grant is still active.
 * Returns null if the session is invalid, expired, or revoked.
 */
export async function resolveCustomerAccessSession(
  cookieValue: string,
  nowMs: number = Date.now(),
): Promise<CustomerAccessGrantRecord | null> {
  const payload = verifyCustomerAccessSession(cookieValue);
  if (!payload) return null;

  // Check session expiry
  const sessionExpiryMs = new Date(payload.expiresAt).getTime();
  if (Number.isNaN(sessionExpiryMs) || sessionExpiryMs <= nowMs) {
    return null;
  }

  const grant = await queryOne<CustomerAccessGrantRecord>(
    `SELECT * FROM ${TABLES.customerAccessGrants}
     WHERE workspace_id = ? AND id = ?`,
    [payload.workspaceId, payload.grantId],
  );

  if (!grant) return null;

  // Revocation is checked on every protected request (Tech Spec §6.2)
  if (grant.status === "revoked" || grant.revoked_at) {
    return null;
  }

  // Check grant expiry
  const grantExpiryMs = new Date(grant.expires_at).getTime();
  if (Number.isNaN(grantExpiryMs) || grantExpiryMs <= nowMs) {
    return null;
  }

  return grant;
}

// ── Rate Limit Fingerprint (Tech Spec §6.3) ──

/**
 * Create a rate-limit fingerprint from an IP address and token/grant identifier.
 * Per Tech Spec §6.3: "Exchange and mutation attempts are rate-limited by IP
 * plus token/grant fingerprint."
 */
export function rateLimitFingerprint(ip: string, tokenOrGrantId: string): string {
  return createHash("sha256").update(`${ip}:${tokenOrGrantId}`).digest("hex").substring(0, 32);
}

// ── Protected Response Headers (Tech Spec §6.3) ──

export const CUSTOMER_ACCESS_RESPONSE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

// ── Audit Helpers (Tech Spec §12) ──
//
// Per Tech Spec §12: audit actions for customer_access.exchange,
// customer_access.access_denied, and customer_access.logout are written
// directly by the public API route layer (not through executeCommand).
//
// Access-denied audit is sampled/rate-limited to avoid an attacker creating
// an unbounded audit stream.

/**
 * Look up a grant by raw token for audit purposes only.
 * Returns {workspaceId, grantId} if the token hash matches a grant,
 * or null if no match. Does NOT verify expiry or revocation — the caller
 * uses this only to populate workspaceId/grantId in access_denied audit.
 */
export async function tryLookupGrantForAudit(
  rawToken: string,
): Promise<{ workspaceId: string; grantId: string } | null> {
  if (!rawToken || rawToken.length < 10) return null;
  const tokenHash = hashAccessToken(rawToken);
  const row = await queryOne<{ id: string; workspace_id: string }>(
    `SELECT id, workspace_id FROM ${TABLES.customerAccessGrants} WHERE token_hash = ?`,
    [tokenHash],
  );
  if (!row) return null;
  return { workspaceId: row.workspace_id, grantId: row.id };
}

// ── Access-denied sampling (Tech Spec §12) ──
//
// Simple in-memory time-window sampler: at most 1 access_denied audit event
// per fingerprint per sample interval. This prevents unbounded audit streams
// from brute-force token attempts while preserving security visibility.

const ACCESS_DENIED_SAMPLE_INTERVAL_MS = 60_000; // 1 minute
const accessDeniedLastSampled = new Map<string, number>();

/**
 * Determine whether an access_denied event should be audited for the given
 * fingerprint. Returns true at most once per sample interval per fingerprint.
 */
export function shouldSampleAccessDenied(fingerprint: string): boolean {
  const now = Date.now();
  const lastSampled = accessDeniedLastSampled.get(fingerprint) ?? 0;
  if (now - lastSampled < ACCESS_DENIED_SAMPLE_INTERVAL_MS) {
    return false;
  }
  accessDeniedLastSampled.set(fingerprint, now);
  return true;
}

// ── Mutation Rate Limiting (Tech Spec §6.3) ──

const MUTATION_RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds
const MUTATION_RATE_LIMIT_MAX = 5; // max 5 mutations per window per fingerprint
const mutationAttemptTimestamps = new Map<string, number[]>();

/**
 * Check if a customer mutation request should be rate-limited.
 * Per Tech Spec §6.3: mutation attempts are rate-limited by IP plus
 * token/grant fingerprint.
 *
 * Returns true if the request is allowed, false if rate-limited.
 */
export function checkMutationRateLimit(fingerprint: string): boolean {
  const now = Date.now();
  const timestamps = mutationAttemptTimestamps.get(fingerprint) ?? [];
  // Prune timestamps outside the window
  const recent = timestamps.filter((ts) => now - ts < MUTATION_RATE_LIMIT_WINDOW_MS);
  if (recent.length >= MUTATION_RATE_LIMIT_MAX) {
    return false;
  }
  recent.push(now);
  mutationAttemptTimestamps.set(fingerprint, recent);
  return true;
}

// ── Same-Origin Validation (Tech Spec §8.2) ──

/**
 * Validate that the request origin matches the expected application origin.
 * Per Tech Spec §8.2: customer mutation routes must verify same-origin
 * to prevent CSRF attacks.
 *
 * Returns true if the origin is valid, false otherwise.
 */
export function validateSameOrigin(requestOrigin: string | null, appUrl: string): boolean {
  if (!requestOrigin) return false;
  try {
    const expected = new URL(appUrl);
    const actual = new URL(requestOrigin);
    return actual.origin === expected.origin;
  } catch {
    return false;
  }
}

/**
 * Extract the client IP from a request, checking common forwarded headers.
 */
export function extractClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")
    || "unknown"
  );
}

/**
 * Write a customer_access.exchange audit event (Tech Spec §12).
 * Called by the exchange route on successful token exchange.
 */
export async function auditCustomerAccessExchange(
  workspaceId: string,
  grantId: string,
  requestId?: string,
): Promise<void> {
  await writeAuditEvent({
    workspaceId,
    actorType: "customer",
    actorId: grantId,
    action: "customer_access.exchange",
    entityType: "customer_access_grant",
    entityId: grantId,
    after: { exchangedAt: new Date().toISOString() },
    requestId: requestId ?? null,
  });
}

/**
 * Write a customer_access.access_denied audit event (Tech Spec §12).
 * The caller must check shouldSampleAccessDenied() first to prevent
 * unbounded audit streams.
 */
export async function auditCustomerAccessDenied(
  workspaceId: string,
  grantId: string,
  requestId?: string,
): Promise<void> {
  await writeAuditEvent({
    workspaceId,
    actorType: "system",
    actorId: "customer_access_guard",
    action: "customer_access.access_denied",
    entityType: "customer_access_grant",
    entityId: grantId,
    after: { deniedAt: new Date().toISOString() },
    requestId: requestId ?? null,
  });
}

/**
 * Write a customer_access.logout audit event (Tech Spec §12).
 * Called by the logout route when a customer explicitly ends their session.
 */
export async function auditCustomerAccessLogout(
  workspaceId: string,
  grantId: string,
  requestId?: string,
): Promise<void> {
  await writeAuditEvent({
    workspaceId,
    actorType: "customer",
    actorId: grantId,
    action: "customer_access.logout",
    entityType: "customer_access_grant",
    entityId: grantId,
    after: { loggedOutAt: new Date().toISOString() },
    requestId: requestId ?? null,
  });
}
