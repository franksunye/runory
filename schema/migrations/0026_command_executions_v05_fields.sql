-- 0026_command_executions_v05_fields.sql
-- v0.5 Spec §5.3: Add expected_version and error_message to command_executions
-- (for databases that already have the command_executions table from 0022)

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions ADD COLUMN expected_version INTEGER;
ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}command_executions ADD COLUMN error_message TEXT;
