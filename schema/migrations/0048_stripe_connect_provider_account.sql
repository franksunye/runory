-- Tolerant: true
-- Stripe Connect Direct-Charge provider-account extension (v0.8 Batch 3, Tech Spec 9.2).
-- Extends the existing payment_provider_account table with Connect lifecycle fields.
-- The existing provider_account_ref stores the acct_... Connected Account identifier.
-- No second account-ID mapping is added.
--
-- This migration ALTERs a business table that is created dynamically by pack
-- installations and may not exist on fresh dev databases. SQLite does not support
-- IF NOT EXISTS for ALTER TABLE ADD COLUMN, so the tolerant migration runner skips
-- "no such table" and "duplicate column" errors.

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN account_configuration_version TEXT;

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN onboarding_status TEXT NOT NULL DEFAULT 'not_started';

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN details_submitted INTEGER NOT NULL DEFAULT 0;

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN charges_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN payouts_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN requirements_status TEXT NOT NULL DEFAULT 'clear';

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN requirements_json TEXT;

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN last_synced_at TEXT;

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN disconnected_at TEXT;

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}payment_provider_account
  ADD COLUMN aggregate_version INTEGER NOT NULL DEFAULT 1;
