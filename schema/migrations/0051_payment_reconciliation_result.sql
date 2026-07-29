-- v0.9.3 Payment Reconciliation — ReconciliationResult table
--
-- Persists auditable reconciliation results comparing Runory Payment
-- canonical state with a provider snapshot.
-- Status: consistent | divergent | unknown
-- Diagnostic details never expose credentials or sensitive provider payloads.

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}payment_reconciliation_result (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_payment_id TEXT,
  status TEXT NOT NULL,
  -- Comparison details (safe, no credentials)
  comparison_json TEXT NOT NULL,
  -- The provider snapshot used for comparison (safe fields only)
  provider_snapshot_json TEXT,
  -- The Runory canonical state at comparison time
  canonical_snapshot_json TEXT,
  -- Divergences array (empty if consistent)
  divergences_json TEXT NOT NULL DEFAULT '[]',
  -- Whether a replay was attempted
  replay_attempted INTEGER NOT NULL DEFAULT 0,
  replay_command_id TEXT,
  -- Who triggered the reconciliation
  reconciled_by TEXT NOT NULL,
  reconciled_at TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_payment
  ON {{BUSINESS_TABLE_PREFIX}}payment_reconciliation_result(workspace_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status
  ON {{BUSINESS_TABLE_PREFIX}}payment_reconciliation_result(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_provider
  ON {{BUSINESS_TABLE_PREFIX}}payment_reconciliation_result(workspace_id, provider, provider_account_id);
