-- Phase 7: Export, Deletion, and Recovery Operations
-- Migration 0007: export_jobs, deletion_jobs

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}export_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  manifest_json TEXT,
  download_url TEXT,
  download_expires_at TEXT,
  checksum TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_workspace ON {{RUNORY_TABLE_PREFIX}}export_jobs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_org ON {{RUNORY_TABLE_PREFIX}}export_jobs(organization_id);

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}deletion_jobs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('workspace','organization','user')),
  entity_id TEXT NOT NULL,
  organization_id TEXT,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','scheduled','purging','purged','restored','cancelled')),
  purge_after TEXT NOT NULL,
  purged_at TEXT,
  error_message TEXT,
  confirmation_code_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deletion_jobs_entity ON {{RUNORY_TABLE_PREFIX}}deletion_jobs(entity_type, entity_id, status);
CREATE INDEX IF NOT EXISTS idx_deletion_jobs_purge ON {{RUNORY_TABLE_PREFIX}}deletion_jobs(status, purge_after);
