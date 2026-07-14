-- Generalize Command Contract ownership from business Modules to versioned
-- Contract sources. Existing Module snapshots are retained without changing
-- their command keys or JSON payloads. Platform Service snapshots can then be
-- provisioned through the same registry.

DROP INDEX IF EXISTS idx_workspace_command_contracts_module;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_command_contracts
  RENAME TO {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_command_contracts_legacy;

CREATE TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_command_contracts (
  workspace_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('module', 'platform_service')),
  source_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  contract_json TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, command_key)
);

INSERT INTO {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_command_contracts (
  workspace_id, command_key, source_kind, source_id, source_version,
  contract_version, contract_json, installed_at
)
SELECT
  workspace_id, command_key, 'module', module_id, module_version,
  contract_version, contract_json, installed_at
FROM {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_command_contracts_legacy;

DROP TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_command_contracts_legacy;

CREATE INDEX idx_workspace_command_contracts_source
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_command_contracts(
    workspace_id, source_kind, source_id
  );
