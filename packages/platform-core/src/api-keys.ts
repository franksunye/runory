import { randomBytes, createHash, randomUUID } from "node:crypto";
import { queryAll, queryOne, execute, genId, now } from "./db";
import { TABLES } from "./contracts";
import { authorizeWorkspace } from "./tenancy";
import {
  type Principal,
  type WorkspaceRole,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InvalidInputError,
} from "./context";

// ── API Key Types ──

export interface ApiKey {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: "active" | "revoked" | "expired";
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  rotatedFrom: string | null;
}

export interface ApiKeyWithToken extends ApiKey {
  /** The plaintext token, only available at creation time */
  token: string;
}

export type ApiKeyScope = "workspace:read" | "records:write" | "extensions:manage";

export const VALID_SCOPES: ApiKeyScope[] = [
  "workspace:read",
  "records:write",
  "extensions:manage",
];

const KEY_PREFIX = "rk_"; // "runory key"
const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 90;

// ── Hashing ──

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): { token: string; prefix: string; hash: string } {
  const bytes = randomBytes(TOKEN_BYTES);
  const token = KEY_PREFIX + bytes.toString("hex");
  const prefix = token.slice(0, 12); // "rk_" + first 9 hex chars
  return { token, prefix, hash: hashToken(token) };
}

// ── Create API Key ──

export async function createApiKey(
  workspaceId: string,
  userId: string,
  input: { name: string; scopes: string[]; expiresAt?: string | null }
): Promise<ApiKeyWithToken> {
  if (!input.name?.trim()) throw new InvalidInputError("API key name is required");
  if (!input.scopes || input.scopes.length === 0) {
    throw new InvalidInputError("At least one scope is required");
  }
  for (const scope of input.scopes) {
    if (!VALID_SCOPES.includes(scope as ApiKeyScope)) {
      throw new InvalidInputError(`Invalid scope: ${scope}`);
    }
  }

  // Verify the user has workspace access
  const access = await authorizeWorkspace(workspaceId, userId, "admin");
  if (!access) throw new AuthorizationError("Workspace admin role required to create API keys");

  const { token, prefix, hash } = generateToken();
  const id = genId("apik");
  const ts = now();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86400000).toISOString();

  await execute(
    `INSERT INTO ${TABLES.apiKeys} (id, workspace_id, user_id, name, key_prefix, key_hash, scopes_json, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [id, workspaceId, userId, input.name.trim(), prefix, hash, JSON.stringify(input.scopes), expiresAt, ts, ts]
  );

  return {
    id,
    workspaceId,
    userId,
    name: input.name.trim(),
    keyPrefix: prefix,
    scopes: input.scopes,
    status: "active",
    expiresAt,
    lastUsedAt: null,
    lastUsedIp: null,
    createdAt: ts,
    updatedAt: ts,
    revokedAt: null,
    rotatedFrom: null,
    token,
  };
}

// ── List API Keys ──

export async function listApiKeys(workspaceId: string, userId: string): Promise<ApiKey[]> {
  const access = await authorizeWorkspace(workspaceId, userId, "admin");
  if (!access) throw new AuthorizationError("Workspace admin role required");

  const rows = await queryAll<{
    id: string; workspace_id: string; user_id: string; name: string;
    key_prefix: string; scopes_json: string; status: string; expires_at: string | null;
    last_used_at: string | null; last_used_ip: string | null; created_at: string;
    updated_at: string; revoked_at: string | null; rotated_from: string | null;
  }>(
    `SELECT * FROM ${TABLES.apiKeys} WHERE workspace_id = ? AND status = 'active' ORDER BY created_at DESC`,
    [workspaceId]
  );

  return rows.map(r => ({
    id: r.id, workspaceId: r.workspace_id, userId: r.user_id, name: r.name,
    keyPrefix: r.key_prefix, scopes: JSON.parse(r.scopes_json), status: r.status as ApiKey["status"],
    expiresAt: r.expires_at, lastUsedAt: r.last_used_at, lastUsedIp: r.last_used_ip,
    createdAt: r.created_at, updatedAt: r.updated_at, revokedAt: r.revoked_at, rotatedFrom: r.rotated_from,
  }));
}

// ── Revoke API Key ──

export async function revokeApiKey(
  apiKeyId: string,
  workspaceId: string,
  userId: string
): Promise<void> {
  const access = await authorizeWorkspace(workspaceId, userId, "admin");
  if (!access) throw new AuthorizationError("Workspace admin role required");

  const key = await queryOne<{ user_id: string; status: string }>(
    `SELECT user_id, status FROM ${TABLES.apiKeys} WHERE id = ? AND workspace_id = ?`,
    [apiKeyId, workspaceId]
  );
  if (!key) throw new NotFoundError("API key not found");
  if (key.status === "revoked") throw new ConflictError("API key already revoked");

  await execute(
    `UPDATE ${TABLES.apiKeys} SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ?`,
    [now(), now(), apiKeyId]
  );
}

// ── Rotate API Key ──

export async function rotateApiKey(
  apiKeyId: string,
  workspaceId: string,
  userId: string
): Promise<ApiKeyWithToken> {
  const access = await authorizeWorkspace(workspaceId, userId, "admin");
  if (!access) throw new AuthorizationError("Workspace admin role required");

  const existing = await queryOne<{
    id: string; workspace_id: string; user_id: string; name: string;
    scopes_json: string; expires_at: string | null; status: string;
  }>(
    `SELECT * FROM ${TABLES.apiKeys} WHERE id = ? AND workspace_id = ? AND status = 'active'`,
    [apiKeyId, workspaceId]
  );
  if (!existing) throw new NotFoundError("Active API key not found");

  // Revoke old key
  const ts = now();
  await execute(
    `UPDATE ${TABLES.apiKeys} SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, apiKeyId]
  );

  // Create new key with same settings
  const { token, prefix, hash } = generateToken();
  const newId = genId("apik");
  const expiresAt = existing.expires_at ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86400000).toISOString();

  await execute(
    `INSERT INTO ${TABLES.apiKeys} (id, workspace_id, user_id, name, key_prefix, key_hash, scopes_json, status, expires_at, created_at, updated_at, rotated_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [newId, existing.workspace_id, existing.user_id, existing.name, prefix, hash, existing.scopes_json, expiresAt, ts, ts, apiKeyId]
  );

  return {
    id: newId,
    workspaceId: existing.workspace_id,
    userId: existing.user_id,
    name: existing.name,
    keyPrefix: prefix,
    scopes: JSON.parse(existing.scopes_json),
    status: "active",
    expiresAt,
    lastUsedAt: null,
    lastUsedIp: null,
    createdAt: ts,
    updatedAt: ts,
    revokedAt: null,
    rotatedFrom: apiKeyId,
    token,
  };
}

// ── Resolve API Key (for authentication) ──
//
// Validates the token, checks expiry, verifies creator still has workspace access,
// and updates last_used_at. Returns principal + workspace access info.

export async function resolveApiKey(
  token: string,
  workspaceId: string
): Promise<{
  principal: Principal;
  scopes: string[];
  workspaceRole: WorkspaceRole;
} | null> {
  if (!token.startsWith(KEY_PREFIX)) return null;

  const hash = hashToken(token);
  const row = await queryOne<{
    id: string; workspace_id: string; user_id: string; name: string;
    scopes_json: string; status: string; expires_at: string | null;
  }>(
    `SELECT id, workspace_id, user_id, name, scopes_json, status, expires_at FROM ${TABLES.apiKeys}
     WHERE key_hash = ? AND workspace_id = ? AND status = 'active'`,
    [hash, workspaceId]
  );
  if (!row) return null;

  // Check expiry
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    await execute(
      `UPDATE ${TABLES.apiKeys} SET status = 'expired', updated_at = ? WHERE id = ?`,
      [now(), row.id]
    );
    return null;
  }

  // Verify creator still has workspace access (creator permission invalidation)
  const access = await authorizeWorkspace(row.workspace_id, row.user_id, "viewer");
  if (!access) {
    // Creator lost workspace access — invalidate key immediately
    await execute(
      `UPDATE ${TABLES.apiKeys} SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), row.id]
    );
    return null;
  }

  // Update last_used_at (non-blocking, don't fail on error)
  const ts = now();
  await execute(
    `UPDATE ${TABLES.apiKeys} SET last_used_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, row.id]
  ).catch(() => {});

  // Get user info for principal
  const user = await queryOne<{ id: string; email: string | null; display_name: string }>(
    `SELECT id, email, display_name FROM ${TABLES.users} WHERE id = ? AND status = 'active'`,
    [row.user_id]
  );
  if (!user) return null;

  return {
    principal: {
      userId: user.id,
      email: user.email,
      displayName: user.display_name,
      authMethod: "api_key",
      apiKeyId: row.id,
    },
    scopes: JSON.parse(row.scopes_json),
    workspaceRole: access.role,
  };
}

// ── Check API Key Scope ──

export function hasScope(scopes: string[], required: ApiKeyScope): boolean {
  return scopes.includes(required);
}
