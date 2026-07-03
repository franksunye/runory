-- Upgrade migration: runory.service-visit 1.0.0 → 1.1.0
-- Adds optimistic-locking aggregate version, assignment and schedule entry
-- foreign keys, and an outcome column to the service_visit business table.
--
-- IMPORTANT: This migration is NOT idempotent. It should only run once
-- per workspace upgrade from 1.0.0 to 1.1.0. The migration framework
-- tracks applied version transitions to prevent re-execution.
-- If re-executed manually, "duplicate column name" errors are expected.
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}service_visit ADD COLUMN aggregate_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}service_visit ADD COLUMN assignment_id TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}service_visit ADD COLUMN schedule_entry_id TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}service_visit ADD COLUMN outcome TEXT;

CREATE INDEX IF NOT EXISTS idx_business_service_visit_assignment ON {{BUSINESS_TABLE_PREFIX}}service_visit(workspace_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_business_service_visit_schedule ON {{BUSINESS_TABLE_PREFIX}}service_visit(workspace_id, schedule_entry_id);
