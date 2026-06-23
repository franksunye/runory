-- 0015_pack_installations.sql
-- v0.2.3: Shared Business Module Contract — track pack-level metadata.
-- Each pack installation records its terminology overlay so the navigation
-- and object label APIs can present pack-specific labels for shared objects
-- without forking the underlying object definitions.
-- Transaction: required

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_installations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  terminology_json TEXT,
  installed_at TEXT NOT NULL,
  UNIQUE(workspace_id, pack_id)
);

CREATE INDEX IF NOT EXISTS idx_pack_installations_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_installations(workspace_id);
