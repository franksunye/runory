-- 0017_pack_demo_data_status.sql
-- v0.3.4: Pack Onboarding And Demo Data Flow — track demo data status per pack.
-- Values: 'none' (not loaded), 'loaded' (demo data seeded), 'error' (last attempt failed).
-- Transaction: required

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_installations
  ADD COLUMN demo_data_status TEXT NOT NULL DEFAULT 'none';

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_installations
  ADD COLUMN demo_data_loaded_at TEXT;
