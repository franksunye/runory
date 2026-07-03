-- Upgrade migration: runory.technician 1.0.0 → 1.1.0
-- Adds resource_id column to link the technician business record to a
-- scheduling resource in the runtime resources table.
--
-- IMPORTANT: This migration is NOT idempotent. It should only run once
-- per workspace upgrade from 1.0.0 to 1.1.0. The migration framework
-- tracks applied version transitions to prevent re-execution.
-- If re-executed manually, "duplicate column name" errors are expected.
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}technician ADD COLUMN resource_id TEXT;

CREATE INDEX IF NOT EXISTS idx_business_technician_resource ON {{BUSINESS_TABLE_PREFIX}}technician(workspace_id, resource_id);
