-- 0010_extend_installations.sql
-- Extends the installations table with catalog version references, artifact checksum,
-- source release, and richer status lifecycle per docs/09 §7.4

-- Add catalog reference columns
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}installations ADD COLUMN catalog_item_id TEXT REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_items(id);
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}installations ADD COLUMN catalog_version_id TEXT REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_versions(id);
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}installations ADD COLUMN resolved_version TEXT;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}installations ADD COLUMN artifact_checksum TEXT;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}installations ADD COLUMN source_release_id TEXT REFERENCES {{PLATFORM_TABLE_PREFIX}}catalog_releases(id);
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}installations ADD COLUMN last_compatibility_report_id TEXT REFERENCES {{PLATFORM_TABLE_PREFIX}}compatibility_reports(id);
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}installations ADD COLUMN upgraded_at TEXT;
ALTER TABLE {{PLATFORM_TABLE_PREFIX}}installations ADD COLUMN parent_operation_id TEXT;

-- Status was previously only 'installed' — now expanded to include lifecycle states.
-- SQLite does not support adding CHECK constraints via ALTER TABLE, so we rely on
-- application-level validation for the expanded status values:
--   installing / installed / upgrading / failed / disabled

CREATE INDEX IF NOT EXISTS idx_installations_catalog ON {{PLATFORM_TABLE_PREFIX}}installations(catalog_item_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_installations_version ON {{PLATFORM_TABLE_PREFIX}}installations(catalog_version_id);
