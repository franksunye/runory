-- Durable pre-upgrade state is separate from the unique active installation.
-- Snapshot payloads are insert-only and checksummed. Execution progress is kept
-- in a separate row so a retry never overwrites the original recovery point.
-- Transaction: required

CREATE TABLE {{RUNORY_CATALOG_TABLE_PREFIX}}upgrade_snapshots (
  target_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  snapshot_checksum TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE INDEX idx_upgrade_snapshots_workspace_module
  ON {{RUNORY_CATALOG_TABLE_PREFIX}}upgrade_snapshots(workspace_id, module_id);

CREATE TABLE {{RUNORY_CATALOG_TABLE_PREFIX}}upgrade_execution_states (
  target_id TEXT PRIMARY KEY REFERENCES {{RUNORY_CATALOG_TABLE_PREFIX}}upgrade_snapshots(target_id),
  phase TEXT NOT NULL CHECK (phase IN ('captured', 'migrating', 'applied', 'failed', 'rolled_back')),
  migration_started_at TEXT,
  applied_state_checksum TEXT,
  updated_at TEXT NOT NULL
);
