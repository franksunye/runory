-- Upgrade migration: runory.customer 1.0.0 → 1.1.0
-- Adds `industry` and `website` columns to the customer business table.
--
-- IMPORTANT: This migration is NOT idempotent. It should only run once
-- per workspace upgrade from 1.0.0 to 1.1.0. The migration framework
-- tracks applied version transitions to prevent re-execution.
-- If re-executed manually, "duplicate column name" errors are expected.
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}customer ADD COLUMN industry TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}customer ADD COLUMN website TEXT;
