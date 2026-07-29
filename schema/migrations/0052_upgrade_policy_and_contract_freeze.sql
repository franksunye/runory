-- v0.9.4: Platform policies and contract freeze snapshots
-- Dedicated tables for upgrade policy publication and contract freeze enforcement.
-- These are separate from catalog_items to avoid CHECK constraint conflicts
-- (catalog_items only allows item_type IN ('module', 'pack', 'template')).

CREATE TABLE IF NOT EXISTS {{RUNORY_CATALOG_TABLE_PREFIX}}platform_policies (
  id TEXT PRIMARY KEY,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('compatibility', 'upgrade', 'deprecation', 'known_boundaries')),
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  version TEXT NOT NULL,
  published_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'superseded')),
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_policies_type
  ON {{RUNORY_CATALOG_TABLE_PREFIX}}platform_policies(policy_type, status);

CREATE TABLE IF NOT EXISTS {{RUNORY_CATALOG_TABLE_PREFIX}}contract_freeze_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  captured_by TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contract_freeze_snapshots_status
  ON {{RUNORY_CATALOG_TABLE_PREFIX}}contract_freeze_snapshots(status, captured_at);
