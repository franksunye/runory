-- Persist the exact Workspace Contract source and semantic Provider versions
-- resolved for each successful governed Command execution. Existing execution
-- rows remain valid with null diagnostics.
-- Transaction: required

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions
  ADD COLUMN contract_source_kind TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions
  ADD COLUMN contract_source_id TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions
  ADD COLUMN contract_source_version TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions
  ADD COLUMN contract_version TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions
  ADD COLUMN provider_versions_json TEXT;

CREATE INDEX IF NOT EXISTS idx_command_executions_contract_source
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions(
    workspace_id, contract_source_kind, contract_source_id
  );
