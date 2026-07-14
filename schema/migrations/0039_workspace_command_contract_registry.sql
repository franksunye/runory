-- v0.5.3 workspace-scoped Command Contract registry
--
-- An installation snapshots the Contract from the exact Module version that
-- was installed. Runtime resolution therefore follows workspace composition,
-- not whichever manifests happen to ship with the current process.

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_command_contracts (
  workspace_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  module_id TEXT NOT NULL,
  module_version TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  contract_json TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, command_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_command_contracts_module
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}workspace_command_contracts(workspace_id, module_id);
