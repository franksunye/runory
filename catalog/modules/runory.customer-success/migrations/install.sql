-- runory.customer-success v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}customer_success (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  followup_number TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  followup_type TEXT NOT NULL DEFAULT 'check_in',
  priority TEXT NOT NULL DEFAULT 'medium',
  scheduled_at TEXT,
  completed_at TEXT,
  company_id TEXT,
  contact_id TEXT,
  deal_id TEXT,
  task_id TEXT,
  outcome TEXT,
  satisfaction_score INTEGER,
  assigned_to TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_customer_success_workspace ON {{BUSINESS_TABLE_PREFIX}}customer_success(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_customer_success_status ON {{BUSINESS_TABLE_PREFIX}}customer_success(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_customer_success_type ON {{BUSINESS_TABLE_PREFIX}}customer_success(workspace_id, followup_type);
CREATE INDEX IF NOT EXISTS idx_business_customer_success_company ON {{BUSINESS_TABLE_PREFIX}}customer_success(workspace_id, company_id);
