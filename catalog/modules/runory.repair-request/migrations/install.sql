-- runory.repair-request v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}repair_request (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  repair_number TEXT NOT NULL,
  issue_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  priority TEXT NOT NULL DEFAULT 'medium',
  repair_type TEXT NOT NULL DEFAULT 'on_site',
  is_warranty INTEGER DEFAULT 0,
  is_paid INTEGER DEFAULT 0,
  estimated_cost INTEGER,
  actual_cost INTEGER,
  requested_at TEXT,
  completed_at TEXT,
  company_id TEXT,
  contact_id TEXT,
  asset_id TEXT,
  ticket_id TEXT,
  work_order_id TEXT,
  quote_id TEXT,
  warranty_id TEXT,
  assigned_to TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_repair_request_workspace ON {{BUSINESS_TABLE_PREFIX}}repair_request(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_repair_request_status ON {{BUSINESS_TABLE_PREFIX}}repair_request(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_repair_request_priority ON {{BUSINESS_TABLE_PREFIX}}repair_request(workspace_id, priority);
CREATE INDEX IF NOT EXISTS idx_business_repair_request_company ON {{BUSINESS_TABLE_PREFIX}}repair_request(workspace_id, company_id);
CREATE INDEX IF NOT EXISTS idx_business_repair_request_warranty ON {{BUSINESS_TABLE_PREFIX}}repair_request(workspace_id, is_warranty);
