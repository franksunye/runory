-- Upgrade migration: runory.work-order 1.0.0 → 1.1.0
-- Adds generated business number, optimistic-locking aggregate version,
-- source tracking, resource ownership and cancellation/reopen lifecycle
-- columns to the work_order business table.
--
-- IMPORTANT: This migration is NOT idempotent. It should only run once
-- per workspace upgrade from 1.0.0 to 1.1.0. The migration framework
-- tracks applied version transitions to prevent re-execution.
-- If re-executed manually, "duplicate column name" errors are expected.
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN work_order_number TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN aggregate_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN source_type TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN source_id TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN source_snapshot_hash TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN owner_resource_id TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN cancelled_at TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN reopened_at TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN completion_reason TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN cancellation_reason TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}work_order ADD COLUMN reopen_reason TEXT;
