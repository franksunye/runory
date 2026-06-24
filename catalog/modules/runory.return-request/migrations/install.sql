-- runory.return-request v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}return_request (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  return_number TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  priority TEXT NOT NULL DEFAULT 'medium',
  return_type TEXT NOT NULL DEFAULT 'defective',
  quantity INTEGER DEFAULT 1,
  requested_at TEXT,
  received_at TEXT,
  refunded_at TEXT,
  company_id TEXT,
  contact_id TEXT,
  asset_id TEXT,
  ticket_id TEXT,
  work_order_id TEXT,
  refund_amount INTEGER,
  assigned_to TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_return_request_workspace ON {{BUSINESS_TABLE_PREFIX}}return_request(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_return_request_status ON {{BUSINESS_TABLE_PREFIX}}return_request(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_return_request_priority ON {{BUSINESS_TABLE_PREFIX}}return_request(workspace_id, priority);
CREATE INDEX IF NOT EXISTS idx_business_return_request_company ON {{BUSINESS_TABLE_PREFIX}}return_request(workspace_id, company_id);
