-- 0009_catalog_release_control_plane.sql
-- Catalog & Release Control Plane tables (per docs/09-catalog-release-control-plane.md §7)
-- These tables are platform-level (not workspace-scoped) except where noted.

-- ── Catalog Items (stable identity, e.g., module:runory.customer) ──
CREATE TABLE IF NOT EXISTS {{PLATFORM_TABLE_PREFIX}}catalog_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL CHECK (item_type IN ('module', 'pack', 'template')),
  name TEXT NOT NULL,
  description TEXT,
  publisher_id TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'public')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(item_type, name)
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_type ON {{PLATFORM_TABLE_PREFIX}}catalog_items(item_type, status);

-- ── Catalog Versions (immutable once frozen) ──
CREATE TABLE IF NOT EXISTS {{PLATFORM_TABLE_PREFIX}}catalog_versions (
  id TEXT PRIMARY KEY,
  catalog_item_id TEXT NOT NULL,
  version TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft' CHECK (lifecycle_status IN ('draft', 'validating', 'rejected', 'ready', 'deprecated', 'withdrawn')),
  manifest_json TEXT NOT NULL,
  manifest_schema_version TEXT NOT NULL,
  artifact_uri TEXT,
  artifact_checksum TEXT,
  source_repository TEXT,
  source_commit TEXT,
  build_id TEXT,
  created_by TEXT NOT NULL,
  frozen_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (catalog_item_id) REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_items(id),
  UNIQUE(catalog_item_id, version)
);

CREATE INDEX IF NOT EXISTS idx_catalog_versions_item ON {{PLATFORM_TABLE_PREFIX}}catalog_versions(catalog_item_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_catalog_versions_status ON {{PLATFORM_TABLE_PREFIX}}catalog_versions(lifecycle_status);

-- ── Validation Runs (structured results, not raw CI logs) ──
CREATE TABLE IF NOT EXISTS {{PLATFORM_TABLE_PREFIX}}catalog_validation_runs (
  id TEXT PRIMARY KEY,
  catalog_version_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'passed', 'failed')),
  validator_version TEXT,
  result_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (catalog_version_id) REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_validation_runs_version ON {{PLATFORM_TABLE_PREFIX}}catalog_validation_runs(catalog_version_id, status);

-- ── Catalog Releases (expose immutable Version to a channel) ──
CREATE TABLE IF NOT EXISTS {{PLATFORM_TABLE_PREFIX}}catalog_releases (
  id TEXT PRIMARY KEY,
  catalog_version_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('internal', 'beta', 'stable')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'paused', 'withdrawn')),
  release_notes TEXT,
  approved_by TEXT,
  released_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (catalog_version_id) REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_versions(id),
  UNIQUE(catalog_version_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_catalog_releases_channel ON {{PLATFORM_TABLE_PREFIX}}catalog_releases(channel, status);

-- ── Pack Version Locks (frozen dependency resolution) ──
CREATE TABLE IF NOT EXISTS {{PLATFORM_TABLE_PREFIX}}pack_version_locks (
  id TEXT PRIMARY KEY,
  pack_catalog_version_id TEXT NOT NULL,
  module_item_id TEXT NOT NULL,
  requested_range TEXT NOT NULL,
  resolved_module_version_id TEXT NOT NULL,
  artifact_checksum TEXT,
  resolution_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (pack_catalog_version_id) REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_versions(id),
  FOREIGN KEY (resolved_module_version_id) REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_versions(id),
  UNIQUE(pack_catalog_version_id, module_item_id)
);

-- ── Release Rollouts (cohort upgrade execution plan) ──
CREATE TABLE IF NOT EXISTS {{PLATFORM_TABLE_PREFIX}}release_rollouts (
  id TEXT PRIMARY KEY,
  catalog_release_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('allowlist', 'percentage', 'all_eligible')),
  target_config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'resumed', 'completed', 'canceled')),
  success_threshold REAL NOT NULL DEFAULT 0.95,
  failure_threshold REAL NOT NULL DEFAULT 0.05,
  started_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (catalog_release_id) REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_releases(id)
);

CREATE INDEX IF NOT EXISTS idx_release_rollouts_release ON {{PLATFORM_TABLE_PREFIX}}release_rollouts(catalog_release_id, status);

-- ── Rollout Targets (per-workspace upgrade state) ──
CREATE TABLE IF NOT EXISTS {{PLATFORM_TABLE_PREFIX}}rollout_targets (
  id TEXT PRIMARY KEY,
  rollout_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  from_version_id TEXT,
  to_version_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  reason_code TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (rollout_id) REFERENCES {{PLATFORM_TABLE_PREFIX}}release_rollouts(id),
  UNIQUE(rollout_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_rollout_targets_rollout ON {{PLATFORM_TABLE_PREFIX}}rollout_targets(rollout_id, status);
CREATE INDEX IF NOT EXISTS idx_rollout_targets_workspace ON {{PLATFORM_TABLE_PREFIX}}rollout_targets(workspace_id);

-- ── Compatibility Reports (workspace-scoped, preflight checks) ──
CREATE TABLE IF NOT EXISTS {{PLATFORM_TABLE_PREFIX}}compatibility_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  from_version_id TEXT,
  to_version_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('compatible', 'warning', 'blocked')),
  core_compatibility_json TEXT,
  dependency_diff_json TEXT,
  permission_diff_json TEXT,
  schema_diff_json TEXT,
  extension_conflicts_json TEXT,
  migration_risk_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (catalog_item_id) REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_items(id),
  FOREIGN KEY (to_version_id) REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_compat_reports_workspace ON {{PLATFORM_TABLE_PREFIX}}compatibility_reports(workspace_id, catalog_item_id);
