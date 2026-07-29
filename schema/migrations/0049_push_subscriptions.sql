-- Transaction: required
-- v0.9.2 Mobile PWA Notification — push subscription and preferences tables.
-- Spec: v0.9 PWA Notification Technical Spec §5 (Principal and subscription contract)
--   and §6 (Preferences and consent).

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}push_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK(principal_type IN ('workspace_membership', 'customer_access_grant')),
  principal_id TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent_summary TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'expired', 'revoked')),
  created_at TEXT NOT NULL,
  last_verified_at TEXT,
  last_accepted_at TEXT,
  last_error_code TEXT,
  UNIQUE(workspace_id, principal_type, principal_id, endpoint_hash)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_workspace
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}push_subscriptions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_push_subs_principal
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}push_subscriptions(principal_type, principal_id);

CREATE INDEX IF NOT EXISTS idx_push_subs_status
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}push_subscriptions(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint_hash
  ON {{RUNORY_RUNTIME_TABLE_PREFIX}}push_subscriptions(endpoint_hash);

CREATE TABLE IF NOT EXISTS {{RUNORY_RUNTIME_TABLE_PREFIX}}push_preferences (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK(principal_type IN ('workspace_membership', 'customer_access_grant')),
  principal_id TEXT NOT NULL,
  global_enabled INTEGER NOT NULL DEFAULT 1,
  work_assignment_enabled INTEGER NOT NULL DEFAULT 1,
  schedule_change_enabled INTEGER NOT NULL DEFAULT 1,
  work_returned_enabled INTEGER NOT NULL DEFAULT 1,
  approval_ready_enabled INTEGER NOT NULL DEFAULT 1,
  customer_document_enabled INTEGER NOT NULL DEFAULT 1,
  payment_status_enabled INTEGER NOT NULL DEFAULT 1,
  service_status_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, principal_type, principal_id)
);
