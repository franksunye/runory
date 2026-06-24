-- 0020_pack_diagnostics.sql
-- v0.3.6: Governance, Observability, And Release Hardening
-- Add error message columns to pack_installations for install and demo data diagnostics.
-- Tolerant: true (pack_installations may not exist in fresh test databases)

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_installations
  ADD COLUMN install_error_message TEXT;

ALTER TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}pack_installations
  ADD COLUMN demo_data_error_message TEXT;
