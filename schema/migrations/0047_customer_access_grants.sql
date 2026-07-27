-- Customer Access grants for v0.8 Batch 3 (Tech Spec 5.2).
-- Stores expiring, revocable, tenant-scoped access grants that bind a customer
-- subject to an explicit journey root. Only the token hash is persisted.
-- The raw token is never stored, logged, or audited.

CREATE TABLE {{RUNORY_RUNTIME_TABLE_PREFIX}}customer_access_grants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('contact', 'company')),
  subject_id TEXT NOT NULL,
  root_object_type TEXT NOT NULL CHECK(root_object_type IN ('quote', 'work_order')),
  root_record_id TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'expired')),
  expires_at TEXT NOT NULL,
  first_accessed_at TEXT,
  last_accessed_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT,
  created_by TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_customer_access_grants_subject
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}customer_access_grants(workspace_id, subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_customer_access_grants_root
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}customer_access_grants(workspace_id, root_object_type, root_record_id);

CREATE INDEX IF NOT EXISTS idx_customer_access_grants_token_hash
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}customer_access_grants(token_hash);
