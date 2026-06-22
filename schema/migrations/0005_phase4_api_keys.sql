-- Phase 4: Audit, API Keys, and Security Baseline
-- Migration 0005: API Keys table

CREATE TABLE IF NOT EXISTS {{RUNORY_TABLE_PREFIX}}api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
  expires_at TEXT,
  last_used_at TEXT,
  last_used_ip TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  rotated_from TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON {{RUNORY_TABLE_PREFIX}}api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON {{RUNORY_TABLE_PREFIX}}api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON {{RUNORY_TABLE_PREFIX}}api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON {{RUNORY_TABLE_PREFIX}}api_keys(workspace_id, status);
