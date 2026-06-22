import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { batch, execute, genId, now, queryAll, queryOne } from "./db";
import { TABLES } from "./contracts";
import { getMailProviderUrl, getSessionCookieName } from "./platform-config";
import {
  ConflictError,
  RateLimitError,
  AuthenticationError,
  type Principal,
} from "./context";

// ── Configuration ──

const OTP_TTL_MINUTES = 10;
const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_DAYS = 30;
const SESSION_TOKEN_BYTES = 32;

// Rate limits (per window)
const RATE_LIMITS = {
  otp_request_per_email: { max: 5, windowMinutes: 15 },   // 5 OTP requests per email per 15 min
  otp_request_per_ip: { max: 20, windowMinutes: 15 },      // 20 OTP requests per IP per 15 min
  otp_verify_per_email: { max: 10, windowMinutes: 15 },    // 10 verify attempts per email per 15 min
  otp_verify_per_ip: { max: 30, windowMinutes: 15 },       // 30 verify attempts per IP per 15 min
} as const;

// ── Email Normalization ──
//
// Per SaaS Core Boundaries §4.2:
//   - Email normalization with unique identity constraint
//   - Interface responses must not leak whether email is already registered

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Basic RFC 5322 simplified validation
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim()) && email.trim().length <= 254;
}

// ── Hashing ──

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

function hashToken(token: string): string {
  return sha256(token);
}

function hashIp(ip: string): string {
  return sha256(`ip:${ip}`);
}

function hashUserAgent(ua: string): string {
  return sha256(`ua:${ua}`);
}

// ── OTP Generation ──

export function generateOtpCode(): string {
  // Generate a 6-digit code using crypto.randomInt for uniform distribution
  const code = randomInt(0, 1_000_000);
  return code.toString().padStart(OTP_LENGTH, "0");
}

// ── Session Token Generation ──

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("hex");
}

// ── Rate Limiting ──

interface RateLimitConfig {
  max: number;
  windowMinutes: number;
}

async function checkRateLimit(
  bucketType: keyof typeof RATE_LIMITS | string,
  bucketKey: string,
  config: RateLimitConfig
): Promise<void> {
  const windowStart = new Date(Date.now() - (Date.now() % (config.windowMinutes * 60 * 1000)));
  const windowEnd = new Date(windowStart.getTime() + config.windowMinutes * 60 * 1000);
  const windowStartStr = windowStart.toISOString();
  const windowEndStr = windowEnd.toISOString();

  // Get current count in this window
  const existing = await queryOne<{ count: number }>(
    `SELECT count FROM ${TABLES.rateLimitBuckets}
     WHERE bucket_type = ? AND bucket_key = ? AND window_start = ?`,
    [bucketType, bucketKey, windowStartStr]
  );

  const currentCount = existing?.count ?? 0;
  if (currentCount >= config.max) {
    throw new RateLimitError(`Too many requests. Please try again after ${windowEnd.toISOString()}.`);
  }

  // Increment counter
  if (existing) {
    await execute(
      `UPDATE ${TABLES.rateLimitBuckets} SET count = count + 1 WHERE bucket_type = ? AND bucket_key = ? AND window_start = ?`,
      [bucketType, bucketKey, windowStartStr]
    );
  } else {
    await execute(
      `INSERT INTO ${TABLES.rateLimitBuckets} (id, bucket_type, bucket_key, count, window_start, window_end)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [genId("rl"), bucketType, bucketKey, windowStartStr, windowEndStr]
    );
  }
}

// ── OTP Request ──

export interface OtpRequestResult {
  challengeId: string;
  emailNormalized: string;
  expiresAt: string;
  /** Whether this email is new (first-time user). UI uses this for onboarding. */
  isNewUser: boolean;
  /** The OTP code — ONLY returned in dev mode for local testing. Production sends via email. */
  devCode?: string;
}

export async function requestOtp(
  rawEmail: string,
  ip: string,
  options: { devMode?: boolean; purpose?: "login" | "org_deletion" } = {}
): Promise<OtpRequestResult> {
  if (!isValidEmail(rawEmail)) {
    throw new AuthenticationError("Invalid email address");
  }

  const emailNormalized = normalizeEmail(rawEmail);
  const purpose = options.purpose ?? "login";
  const ipHashed = hashIp(ip);

  // Rate limit: per email and per IP
  await checkRateLimit("otp_request_per_email", sha256(emailNormalized), RATE_LIMITS.otp_request_per_email);
  await checkRateLimit("otp_request_per_ip", ipHashed, RATE_LIMITS.otp_request_per_ip);

  // Check if auth identity exists
  const existingIdentity = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM ${TABLES.authIdentities} WHERE method = 'email_otp' AND email_normalized = ?`,
    [emailNormalized]
  );

  const code = generateOtpCode();
  const codeHash = sha256(code);
  const challengeId = genId("ch");
  const ts = now();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  await execute(
    `INSERT INTO ${TABLES.authChallenges} (id, auth_identity_id, email_normalized, code_hash, purpose, status, attempts, max_attempts, ip_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
    [
      challengeId,
      existingIdentity?.id ?? null,
      emailNormalized,
      codeHash,
      purpose,
      OTP_MAX_ATTEMPTS,
      ipHashed,
      expiresAt,
      ts,
    ]
  );

  // In production, send email via provider. In dev, return the code.
  if (!options.devMode) {
    await sendOtpEmail(emailNormalized, code);
  }

  return {
    challengeId,
    emailNormalized,
    expiresAt,
    isNewUser: !existingIdentity,
    devCode: options.devMode ? code : undefined,
  };
}

// ── OTP Verification ──

export interface OtpVerifyResult {
  sessionToken: string;
  expiresAt: string;
  principal: Principal;
  isNewUser: boolean;
}

export async function verifyOtp(
  rawEmail: string,
  code: string,
  ip: string,
  userAgent: string,
  options: { devMode?: boolean } = {}
): Promise<OtpVerifyResult> {
  if (!isValidEmail(rawEmail)) {
    throw new AuthenticationError("Invalid email address");
  }

  const emailNormalized = normalizeEmail(rawEmail);
  const ipHashed = hashIp(ip);

  // Rate limit verification attempts
  await checkRateLimit("otp_verify_per_email", sha256(emailNormalized), RATE_LIMITS.otp_verify_per_email);
  await checkRateLimit("otp_verify_per_ip", ipHashed, RATE_LIMITS.otp_verify_per_ip);

  // Find the most recent pending challenge for this email
  const challenge = await queryOne<{
    id: string;
    auth_identity_id: string | null;
    code_hash: string;
    status: string;
    attempts: number;
    max_attempts: number;
    expires_at: string;
    purpose: string;
  }>(
    `SELECT id, auth_identity_id, code_hash, status, attempts, max_attempts, expires_at, purpose
     FROM ${TABLES.authChallenges}
     WHERE email_normalized = ? AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [emailNormalized]
  );

  if (!challenge) {
    throw new AuthenticationError("No active verification code. Please request a new code.");
  }

  // Check expiry
  if (new Date(challenge.expires_at) < new Date()) {
    await execute(
      `UPDATE ${TABLES.authChallenges} SET status = 'expired' WHERE id = ?`,
      [challenge.id]
    );
    throw new AuthenticationError("Verification code has expired. Please request a new code.");
  }

  // Check attempt limit
  if (challenge.attempts >= challenge.max_attempts) {
    await execute(
      `UPDATE ${TABLES.authChallenges} SET status = 'expired' WHERE id = ?`,
      [challenge.id]
    );
    throw new RateLimitError("Too many verification attempts. Please request a new code.");
  }

  // Increment attempts
  await execute(
    `UPDATE ${TABLES.authChallenges} SET attempts = attempts + 1 WHERE id = ?`,
    [challenge.id]
  );

  // Verify code using timing-safe comparison
  const providedHash = sha256(code.trim());
  const expectedHash = challenge.code_hash;
  const providedBuffer = Buffer.from(providedHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new AuthenticationError("Invalid verification code.");
  }

  // Mark challenge as consumed
  await execute(
    `UPDATE ${TABLES.authChallenges} SET status = 'consumed', consumed_at = ? WHERE id = ?`,
    [now(), challenge.id]
  );

  // Resolve or create user
  const { userId, isNewUser } = await resolveOrCreateUser(emailNormalized, challenge.auth_identity_id);

  // Create session
  const sessionToken = generateSessionToken();
  const tokenHash = hashToken(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const ts = now();

  await execute(
    `INSERT INTO ${TABLES.sessions} (id, user_id, token_hash, status, ip_hash, user_agent_hash, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [genId("sess"), userId, tokenHash, ipHashed, hashUserAgent(userAgent), ts, ts, sessionExpiresAt]
  );

  // Get user info for principal
  const user = await queryOne<{ id: string; email: string | null; display_name: string }>(
    `SELECT id, email, display_name FROM ${TABLES.users} WHERE id = ?`,
    [userId]
  );

  const principal: Principal = {
    userId: user!.id,
    email: user!.email,
    displayName: user!.display_name,
    authMethod: "session",
  };

  return {
    sessionToken,
    expiresAt: sessionExpiresAt,
    principal,
    isNewUser,
  };
}

// ── Resolve or Create User (with first-login onboarding) ──

async function resolveOrCreateUser(
  emailNormalized: string,
  existingAuthIdentityId: string | null
): Promise<{ userId: string; isNewUser: boolean }> {
  if (existingAuthIdentityId) {
    // Existing user — get their user_id
    const identity = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM ${TABLES.authIdentities} WHERE id = ?`,
      [existingAuthIdentityId]
    );
    if (identity) {
      return { userId: identity.user_id, isNewUser: false };
    }
  }

  // New user — create User + AuthIdentity + Organization + Workspace in a transaction
  const userId = genId("usr");
  const authIdentityId = genId("auth");
  const organizationId = genId("org");
  const workspaceId = genId("ws");
  const orgMembershipId = genId("orgmem");
  const wsMembershipId = genId("wsmem");
  const wsTenantId = workspaceId; // workspace_tenants uses workspace_id as PK
  const ts = now();

  const emailDisplay = emailNormalized; // Already lowercased; could preserve original casing
  const displayName = emailNormalized.split("@")[0];
  const orgName = `${displayName}'s Workspace`;
  const orgSlug = `${userId.replace(/[^a-z0-9]/gi, "").slice(-12).toLowerCase()}-org`;
  const wsSlug = `${displayName}-${workspaceId.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase()}`;

  // Check if email already exists as a user (race condition safety)
  const existingUser = await queryOne<{ id: string }>(
    `SELECT u.id FROM ${TABLES.users} u
     JOIN ${TABLES.authIdentities} ai ON ai.user_id = u.id
     WHERE ai.method = 'email_otp' AND ai.email_normalized = ?`,
    [emailNormalized]
  );

  if (existingUser) {
    // Another request already created this user — just use them
    return { userId: existingUser.id, isNewUser: false };
  }

  await batch([
    // Create user
    {
      sql: `INSERT INTO ${TABLES.users} (id, external_id, email, display_name, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      args: [userId, `auth:${authIdentityId}`, emailNormalized, displayName, ts, ts],
    },
    // Create auth identity
    {
      sql: `INSERT INTO ${TABLES.authIdentities} (id, user_id, method, email_normalized, email_display, verified, verified_at, created_at, updated_at)
            VALUES (?, ?, 'email_otp', ?, ?, 1, ?, ?, ?)`,
      args: [authIdentityId, userId, emailNormalized, emailDisplay, ts, ts, ts],
    },
    // Create organization
    {
      sql: `INSERT INTO ${TABLES.organizations} (id, name, slug, status, created_at, updated_at)
            VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [organizationId, orgName, orgSlug, ts, ts],
    },
    // Create workspace
    {
      sql: `INSERT INTO ${TABLES.workspaces} (id, name, slug, status, created_at, updated_at)
            VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [workspaceId, orgName, wsSlug, ts, ts],
    },
    // Link workspace to organization
    {
      sql: `INSERT INTO ${TABLES.workspaceTenants} (workspace_id, organization_id, created_at)
            VALUES (?, ?, ?)`,
      args: [wsTenantId, organizationId, ts],
    },
    // Organization owner membership
    {
      sql: `INSERT INTO ${TABLES.organizationMemberships} (id, organization_id, user_id, role, status, created_at, updated_at)
            VALUES (?, ?, ?, 'owner', 'active', ?, ?)`,
      args: [orgMembershipId, organizationId, userId, ts, ts],
    },
    // Workspace admin membership
    {
      sql: `INSERT INTO ${TABLES.workspaceMemberships} (id, workspace_id, user_id, role, status, created_at, updated_at)
            VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      args: [wsMembershipId, workspaceId, userId, ts, ts],
    },
    // Audit: user created
    {
      sql: `INSERT INTO ${TABLES.auditLogs} (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, after_json, created_at)
            VALUES (?, ?, 'system', ?, 'user.create', 'user', ?, ?, ?)`,
      args: [genId("aud"), workspaceId, userId, userId, JSON.stringify({ email: emailNormalized, onboarding: true }), ts],
    },
    // Provision early_access entitlement for the new organization
    {
      sql: `INSERT INTO ${TABLES.organizationEntitlements} (id, organization_id, plan, status, quotas_json, overrides_json, effective_at, created_at, updated_at)
            VALUES (?, ?, 'early_access', 'active', ?, '{}', ?, ?, ?)`,
      args: [
        genId("ent"),
        organizationId,
        JSON.stringify({ workspaces: 3, members: 10, records: 50000, storage_bytes: 5368709120, api_requests: 100000, agent_operations: 1000 }),
        ts, ts, ts,
      ],
    },
  ]);

  return { userId, isNewUser: true };
}

// ── Session Resolution ──

export async function resolveSession(token: string): Promise<Principal | null> {
  if (!token || token.length < 16) return null;

  const tokenHash = hashToken(token);
  const session = await queryOne<{
    id: string;
    user_id: string;
    status: string;
    expires_at: string;
    revoked_at: string | null;
  }>(
    `SELECT id, user_id, status, expires_at, revoked_at FROM ${TABLES.sessions} WHERE token_hash = ?`,
    [tokenHash]
  );

  if (!session) return null;
  if (session.status !== "active" || session.revoked_at) return null;
  if (new Date(session.expires_at) < new Date()) {
    await execute(
      `UPDATE ${TABLES.sessions} SET status = 'expired' WHERE id = ?`,
      [session.id]
    );
    return null;
  }

  // Update last_used_at
  await execute(
    `UPDATE ${TABLES.sessions} SET last_used_at = ? WHERE id = ?`,
    [now(), session.id]
  );

  const user = await queryOne<{ id: string; email: string | null; display_name: string; status: string }>(
    `SELECT id, email, display_name, status FROM ${TABLES.users} WHERE id = ?`,
    [session.user_id]
  );

  if (!user || user.status !== "active") return null;

  return {
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    authMethod: "session",
  };
}

// ── Session Revocation ──

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await execute(
    `UPDATE ${TABLES.sessions} SET status = 'revoked', revoked_at = ? WHERE token_hash = ? AND status = 'active'`,
    [now(), tokenHash]
  );
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.sessions} WHERE user_id = ? AND status = 'active'`,
    [userId]
  );
  if (result.length === 0) return 0;

  await execute(
    `UPDATE ${TABLES.sessions} SET status = 'revoked', revoked_at = ? WHERE user_id = ? AND status = 'active'`,
    [now(), userId]
  );

  return result.length;
}

// ── List User Sessions ──

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ipHash: string | null;
  isCurrent: boolean;
}

export async function listUserSessions(userId: string, currentToken?: string): Promise<SessionInfo[]> {
  const currentTokenHash = currentToken ? hashToken(currentToken) : null;
  const rows = await queryAll<{
    id: string;
    token_hash: string;
    ip_hash: string | null;
    created_at: string;
    last_used_at: string;
    expires_at: string;
  }>(
    `SELECT id, token_hash, ip_hash, created_at, last_used_at, expires_at
     FROM ${TABLES.sessions}
     WHERE user_id = ? AND status = 'active'
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at,
    ipHash: r.ip_hash,
    isCurrent: currentTokenHash === r.token_hash,
  }));
}

// ── Email Provider Adapter ──
//
// Per SaaS Core Boundaries §4.2: "Email delivery uses external service, Runory does not maintain mail server."
// In development, emails are logged to console. In production, this should be replaced with
// a real email provider (Resend, SendGrid, Postmark, etc.).

async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    // Dev mode: log to console (the devCode is also returned from requestOtp)
    console.log(`[DEV MAIL] To: ${email} | OTP Code: ${code} | Expires in ${OTP_TTL_MINUTES} minutes`);
    return;
  }

  const providerUrl = getMailProviderUrl();
  if (!providerUrl) {
    console.error("[MAIL] No mail provider configured. Set PLATFORM_MAIL_PROVIDER_URL.");
    throw new Error("Mail provider not configured");
  }

  // Call external mail provider via HTTP
  // Provider API contract: POST {url} with JSON body { to, subject, html, text }
  // Expected response: 2xx status code
  const response = await fetch(providerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: email,
      subject: "Runory 登录验证码",
      text: `您的验证码是：${code}\n\n验证码将在 ${OTP_TTL_MINUTES} 分钟后过期。\n\n如果不是您本人操作，请忽略此邮件。`,
      html: `<div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;"><h2>Runory 登录验证码</h2><p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #2563eb;">${code}</p><p style="color: #64748b;">验证码将在 ${OTP_TTL_MINUTES} 分钟后过期。</p><p style="color: #94a3b8; font-size: 12px;">如果不是您本人操作，请忽略此邮件。</p></div>`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    console.error(`[MAIL] Provider returned ${response.status}: ${errorText}`);
    throw new Error(`Mail provider error: ${response.status}`);
  }

  console.log(`[MAIL] OTP email sent to ${email}`);
}

// ── Cookie Helpers ──

export const SESSION_COOKIE_NAME = getSessionCookieName();

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge: number;
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

export function expiredCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}

// ── Cleanup expired challenges and sessions (for background job) ──

export async function cleanupExpiredChallenges(): Promise<number> {
  const result = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.authChallenges} WHERE status = 'pending' AND expires_at < ?`,
    [now()]
  );
  if (result.length === 0) return 0;

  await execute(
    `UPDATE ${TABLES.authChallenges} SET status = 'expired' WHERE status = 'pending' AND expires_at < ?`,
    [now()]
  );

  return result.length;
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.sessions} WHERE status = 'active' AND expires_at < ?`,
    [now()]
  );
  if (result.length === 0) return 0;

  await execute(
    `UPDATE ${TABLES.sessions} SET status = 'expired' WHERE status = 'active' AND expires_at < ?`,
    [now()]
  );

  return result.length;
}

export async function cleanupOldRateLimitBuckets(): Promise<number> {
  const result = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.rateLimitBuckets} WHERE window_end < ?`,
    [now()]
  );
  if (result.length === 0) return 0;

  await execute(
    `DELETE FROM ${TABLES.rateLimitBuckets} WHERE window_end < ?`,
    [now()]
  );

  return result.length;
}
