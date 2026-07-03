-- v1.0.0 → v1.1.0 upgrade for runory.work-order
-- Adds v0.5 Commercial FSM fields to existing work_order table.

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN work_order_number TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN aggregate_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN source_type TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN source_id TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN source_snapshot_hash TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN owner_resource_id TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN priority TEXT DEFAULT 'medium';
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN requested_at TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN sla_due_at TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN completed_at TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN cancelled_at TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN reopened_at TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN completion_reason TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN cancellation_reason TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN reopen_reason TEXT;
