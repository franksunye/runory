import { queryOne, queryAll, execute, genId, now, batch } from "./db";
import { TABLES } from "./contracts";
import {
  type OrganizationRole,
  InvalidInputError,
  NotFoundError,
  ConflictError,
} from "./context";

// ── Quota Types ──

export type QuotaMetric =
  | "workspaces"
  | "members"
  | "records"
  | "storage_bytes"
  | "api_requests"
  | "agent_operations";

export type QuotaType = "hard" | "soft";

export interface QuotaDefinition {
  metric: QuotaMetric;
  limit: number;
  type: QuotaType;
}

export interface Entitlement {
  id: string;
  organizationId: string;
  plan: string;
  status: "active" | "suspended" | "expired";
  quotas: Record<QuotaMetric, number>;
  overrides: Record<string, unknown>;
  effectiveAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Default quotas for early_access plan ──

export const EARLY_ACCESS_QUOTAS: Record<QuotaMetric, number> = {
  workspaces: 3,
  members: 10,
  records: 50_000,
  storage_bytes: 5 * 1024 * 1024 * 1024, // 5 GB
  api_requests: 100_000,
  agent_operations: 1_000,
};

export const QUOTA_TYPES: Record<QuotaMetric, QuotaType> = {
  workspaces: "hard",
  members: "hard",
  records: "soft",
  storage_bytes: "hard",
  api_requests: "soft",
  agent_operations: "hard",
};

// ── Provision entitlement for new organization ──

export async function provisionEntitlement(organizationId: string): Promise<Entitlement> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM ${TABLES.organizationEntitlements} WHERE organization_id = ?`,
    [organizationId]
  );
  if (existing) throw new ConflictError("Entitlement already exists for this organization");

  const id = genId("ent");
  const ts = now();
  const quotas = EARLY_ACCESS_QUOTAS;

  await execute(
    `INSERT INTO ${TABLES.organizationEntitlements}
     (id, organization_id, plan, status, quotas_json, overrides_json, effective_at, created_at, updated_at)
     VALUES (?, ?, 'early_access', 'active', ?, '{}', ?, ?, ?)`,
    [id, organizationId, JSON.stringify(quotas), ts, ts, ts]
  );

  return {
    id,
    organizationId,
    plan: "early_access",
    status: "active",
    quotas,
    overrides: {},
    effectiveAt: ts,
    expiresAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

// ── Get entitlement for organization ──

export async function getEntitlement(organizationId: string): Promise<Entitlement | null> {
  const row = await queryOne<{
    id: string; organization_id: string; plan: string; status: string;
    quotas_json: string; overrides_json: string; effective_at: string;
    expires_at: string | null; created_at: string; updated_at: string;
  }>(
    `SELECT * FROM ${TABLES.organizationEntitlements} WHERE organization_id = ? AND status = 'active'`,
    [organizationId]
  );
  if (!row) return null;

  return {
    id: row.id,
    organizationId: row.organization_id,
    plan: row.plan,
    status: row.status as Entitlement["status"],
    quotas: JSON.parse(row.quotas_json),
    overrides: JSON.parse(row.overrides_json),
    effectiveAt: row.effective_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Check quota (returns remaining or throws) ──

export async function checkQuota(
  organizationId: string,
  metric: QuotaMetric,
  delta = 1
): Promise<{ allowed: boolean; current: number; limit: number; remaining: number }> {
  const entitlement = await getEntitlement(organizationId);
  if (!entitlement) {
    // No entitlement = no access
    return { allowed: false, current: 0, limit: 0, remaining: 0 };
  }

  const limit = entitlement.quotas[metric] ?? 0;
  const current = await getCurrentUsage(organizationId, metric);
  const projected = current + delta;
  const remaining = Math.max(0, limit - current);

  if (QUOTA_TYPES[metric] === "hard" && projected > limit) {
    return { allowed: false, current, limit, remaining: 0 };
  }

  return { allowed: true, current, limit, remaining };
}

// ── Enforce quota (throws on hard limit exceeded) ──

export async function enforceQuota(
  organizationId: string,
  metric: QuotaMetric,
  delta = 1
): Promise<void> {
  const result = await checkQuota(organizationId, metric, delta);
  if (!result.allowed) {
    throw new QuotaExceededError(
      `Quota exceeded for ${metric}: ${result.current}/${result.limit}`
    );
  }
}

// ── Get current usage for a metric ──

export async function getCurrentUsage(
  organizationId: string,
  metric: QuotaMetric
): Promise<number> {
  // For count-based metrics, query the actual tables
  switch (metric) {
    case "workspaces": {
      const row = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${TABLES.workspaceTenants} wt
         JOIN ${TABLES.organizations} o ON o.id = wt.organization_id
         WHERE o.id = ?`,
        [organizationId]
      );
      return row?.count ?? 0;
    }
    case "members": {
      const row = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${TABLES.organizationMemberships}
         WHERE organization_id = ? AND status = 'active'`,
        [organizationId]
      );
      return row?.count ?? 0;
    }
    default: {
      // For other metrics, use usage rollups for the current period
      const periodStart = getPeriodStart();
      const row = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(value), 0) as total FROM ${TABLES.usageRollups}
         WHERE organization_id = ? AND metric = ? AND period_start >= ?`,
        [organizationId, metric, periodStart]
      );
      return row?.total ?? 0;
    }
  }
}

// ── Record usage event (idempotent) ──

export async function recordUsageEvent(input: {
  organizationId: string;
  workspaceId: string;
  metric: QuotaMetric;
  delta?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const id = genId("usevt");
  const ts = now();
  const delta = input.delta ?? 1;

  try {
    await execute(
      `INSERT INTO ${TABLES.usageEvents}
       (id, organization_id, workspace_id, metric, delta, idempotency_key, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.metric,
        delta,
        input.idempotencyKey ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        ts,
      ]
    );
  } catch (err: unknown) {
    // Check for unique constraint violation via error code (more reliable than message matching)
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === "SQLITE_CONSTRAINT_UNIQUE" || message.includes("UNIQUE")) {
      // Idempotent: event already recorded
      return;
    }
    throw err;
  }

  // Update rollup
  const periodStart = getPeriodStart();
  const periodEnd = getPeriodEnd();
  const rollupId = genId("roll");

  await execute(
    `INSERT INTO ${TABLES.usageRollups} (id, organization_id, metric, period_start, period_end, value, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(organization_id, metric, period_start) DO UPDATE SET
       value = value + ?, updated_at = ?`,
    [rollupId, input.organizationId, input.metric, periodStart, periodEnd, delta, ts, delta, ts]
  ).catch((err) => {
    console.error("[entitlements] Failed to update usage rollup:", err);
  });
}

// ── Get usage summary ──

export async function getUsageSummary(
  organizationId: string
): Promise<Array<{ metric: QuotaMetric; current: number; limit: number; type: QuotaType; remaining: number }>> {
  const entitlement = await getEntitlement(organizationId);
  if (!entitlement) return [];

  const metrics: QuotaMetric[] = ["workspaces", "members", "records", "storage_bytes", "api_requests", "agent_operations"];
  const result = [];

  for (const metric of metrics) {
    const current = await getCurrentUsage(organizationId, metric);
    const limit = entitlement.quotas[metric] ?? 0;
    result.push({
      metric,
      current,
      limit,
      type: QUOTA_TYPES[metric],
      remaining: Math.max(0, limit - current),
    });
  }

  return result;
}

// ── Update entitlement (admin override) ──

export async function updateEntitlement(
  organizationId: string,
  updates: { quotas?: Partial<Record<QuotaMetric, number>>; expiresAt?: string | null }
): Promise<Entitlement | null> {
  const existing = await getEntitlement(organizationId);
  if (!existing) throw new NotFoundError("Entitlement not found");

  const ts = now();
  const newQuotas = { ...existing.quotas, ...updates.quotas };

  await execute(
    `UPDATE ${TABLES.organizationEntitlements}
     SET quotas_json = ?, expires_at = ?, updated_at = ?
     WHERE organization_id = ? AND status = 'active'`,
    [JSON.stringify(newQuotas), updates.expiresAt ?? existing.expiresAt, ts, organizationId]
  );

  return { ...existing, quotas: newQuotas, expiresAt: updates.expiresAt ?? existing.expiresAt, updatedAt: ts };
}

// ── Helpers ──

function getPeriodStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function getPeriodEnd(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
}

// ── Quota Exceeded Error ──

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}
