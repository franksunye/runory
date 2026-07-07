-- Tolerant: true
-- Adds the v1.1 quote return reason column to existing local/dev business
-- tables that were created before runory.quote v1.1. Fresh databases may not
-- have the business table yet. Already-upgraded databases may already have the
-- column. The migration runner tolerates both cases.

ALTER TABLE {{BUSINESS_TABLE_PREFIX}}quote ADD COLUMN return_reason TEXT;
