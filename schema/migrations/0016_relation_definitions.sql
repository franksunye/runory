-- 0016_relation_definitions.sql
-- v0.3.2: Relations And Cross-Object Context — persist relation declarations
-- from module manifests so the runtime can query relation metadata for
-- metadata-driven detail pages, lookup field renderers, and related-record
-- panels without hardcoding per-route configuration.
-- Transaction: required

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}relation_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  target_object_key TEXT NOT NULL,
  target_module_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  foreign_key TEXT NOT NULL,
  label TEXT,
  module_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, object_key, foreign_key)
);

CREATE INDEX IF NOT EXISTS idx_relation_definitions_workspace_object
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}relation_definitions(workspace_id, object_key);

CREATE INDEX IF NOT EXISTS idx_relation_definitions_workspace_target
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}relation_definitions(workspace_id, target_object_key);
