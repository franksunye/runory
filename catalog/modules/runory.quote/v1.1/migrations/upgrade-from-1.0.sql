-- Upgrade migration: runory.quote 1.0.0 → 1.1.0
-- Adds revision/versioning columns and approval lifecycle timestamps to the
-- quote business table, and migrates the legacy `pending_approval` status to
-- the new `in_review` value.
--
-- IMPORTANT: This migration is NOT idempotent. It should only run once
-- per workspace upgrade from 1.0.0 to 1.1.0. The migration framework
-- tracks applied version transitions to prevent re-execution.
-- If re-executed manually, "duplicate column name" errors are expected.
ALTER TABLE runory_business_quote ADD COLUMN aggregate_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE runory_business_quote ADD COLUMN root_quote_id TEXT;
ALTER TABLE runory_business_quote ADD COLUMN previous_version_id TEXT;
ALTER TABLE runory_business_quote ADD COLUMN revision_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runory_business_quote ADD COLUMN price_book_id TEXT;
ALTER TABLE runory_business_quote ADD COLUMN approved_at TEXT;
ALTER TABLE runory_business_quote ADD COLUMN accepted_at TEXT;
ALTER TABLE runory_business_quote ADD COLUMN rejected_reason TEXT;
ALTER TABLE runory_business_quote ADD COLUMN withdrawn_at TEXT;
ALTER TABLE runory_business_quote ADD COLUMN snapshot_hash TEXT;
ALTER TABLE runory_business_quote ADD COLUMN locked_at TEXT;
-- v0.5 money field renames (quote header only)
ALTER TABLE runory_business_quote ADD COLUMN subtotal REAL;
ALTER TABLE runory_business_quote ADD COLUMN discount_total REAL;
ALTER TABLE runory_business_quote ADD COLUMN tax_total REAL;
ALTER TABLE runory_business_quote ADD COLUMN grand_total REAL;
-- Migration of data from old columns happens in migration-v04-v05.ts
-- Migrate pending_approval → in_review
UPDATE runory_business_quote SET status = 'in_review' WHERE status = 'pending_approval';
