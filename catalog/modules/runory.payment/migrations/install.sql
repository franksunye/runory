-- runory.payment v0.2.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}payment_request (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  purpose TEXT NOT NULL DEFAULT 'general',
  amount_due_minor INTEGER NOT NULL,
  amount_paid_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  customer_contact_id TEXT,
  source_object_type TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  provider_account_id TEXT,
  provider_checkout_id TEXT,
  checkout_url TEXT,
  expires_at TEXT,
  created_by TEXT,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, number)
);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}payment (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  payment_request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_minor INTEGER NOT NULL,
  refunded_amount_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  provider_payment_id TEXT,
  failure_code TEXT,
  failure_message TEXT,
  succeeded_at TEXT,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, provider, provider_account_id, provider_payment_id)
);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}refund (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT,
  provider_refund_id TEXT,
  requested_by TEXT,
  requested_at TEXT NOT NULL,
  succeeded_at TEXT,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, provider_refund_id)
);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}payment_provider_account (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'test',
  provider_account_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'configured',
  capabilities_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, provider, mode, provider_account_ref)
);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}payment_provider_reference (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  event_type TEXT NOT NULL,
  provider_object_type TEXT,
  provider_object_id TEXT,
  provider_event_id TEXT NOT NULL,
  payload_hash TEXT,
  processed_status TEXT NOT NULL DEFAULT 'accepted',
  processed_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, provider, provider_account_id, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_request_workspace_status ON {{BUSINESS_TABLE_PREFIX}}payment_request(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_request_source ON {{BUSINESS_TABLE_PREFIX}}payment_request(workspace_id, source_object_type, source_object_id);
CREATE INDEX IF NOT EXISTS idx_payment_request_contact ON {{BUSINESS_TABLE_PREFIX}}payment_request(workspace_id, customer_contact_id);
CREATE INDEX IF NOT EXISTS idx_payment_request_expiry ON {{BUSINESS_TABLE_PREFIX}}payment_request(workspace_id, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_request_checkout ON {{BUSINESS_TABLE_PREFIX}}payment_request(workspace_id, provider_account_id, provider_checkout_id);
CREATE INDEX IF NOT EXISTS idx_payment_request_payment ON {{BUSINESS_TABLE_PREFIX}}payment(workspace_id, payment_request_id);
CREATE INDEX IF NOT EXISTS idx_payment_status ON {{BUSINESS_TABLE_PREFIX}}payment(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_refund_payment ON {{BUSINESS_TABLE_PREFIX}}refund(workspace_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_provider_reference_object ON {{BUSINESS_TABLE_PREFIX}}payment_provider_reference(workspace_id, provider, provider_object_type, provider_object_id);

CREATE TRIGGER IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}refund_balance_guard
BEFORE INSERT ON {{BUSINESS_TABLE_PREFIX}}refund
FOR EACH ROW
WHEN NEW.status IN ('requested', 'processing', 'succeeded')
  AND NEW.amount_minor + COALESCE((
    SELECT SUM(r.amount_minor)
    FROM {{BUSINESS_TABLE_PREFIX}}refund r
    WHERE r.workspace_id = NEW.workspace_id
      AND r.payment_id = NEW.payment_id
      AND r.status IN ('requested', 'processing', 'succeeded')
  ), 0) > COALESCE((
    SELECT p.amount_minor
    FROM {{BUSINESS_TABLE_PREFIX}}payment p
    WHERE p.workspace_id = NEW.workspace_id
      AND p.id = NEW.payment_id
  ), 0)
BEGIN
  SELECT RAISE(ABORT, 'PAYMENT_REFUND_EXCEEDS_BALANCE');
END;
