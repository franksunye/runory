-- Phase 5: Entitlements, Quotas, and Usage
-- Migration 0006: organization_entitlements, usage_events, usage_rollups

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}organization_entitlements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'early_access' CHECK(plan IN ('early_access','starter','pro','enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','expired')),
  quotas_json TEXT NOT NULL,
  overrides_json TEXT NOT NULL DEFAULT '{}',
  effective_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlements_org ON {{RUNORY_TABLE_PREFIX}}organization_entitlements(organization_id);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}usage_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  delta INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_org_metric ON {{RUNORY_TABLE_PREFIX}}usage_events(organization_id, metric, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_workspace ON {{RUNORY_TABLE_PREFIX}}usage_events(workspace_id, metric, created_at);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}usage_rollups (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_rollups_org_period ON {{RUNORY_TABLE_PREFIX}}usage_rollups(organization_id, metric, period_start);
