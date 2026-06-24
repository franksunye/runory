-- runory.ticket v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}ticket (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  ticket_number TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'medium',
  channel TEXT NOT NULL DEFAULT 'email',
  category TEXT,
  company_id TEXT,
  contact_id TEXT,
  asset_id TEXT,
  work_order_id TEXT,
  quote_id TEXT,
  task_id TEXT,
  knowledge_id TEXT,
  sla_id TEXT,
  assigned_to TEXT,
  resolved_at TEXT,
  closed_at TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_ticket_workspace ON {{BUSINESS_TABLE_PREFIX}}ticket(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_ticket_status ON {{BUSINESS_TABLE_PREFIX}}ticket(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_ticket_priority ON {{BUSINESS_TABLE_PREFIX}}ticket(workspace_id, priority);
CREATE INDEX IF NOT EXISTS idx_business_ticket_channel ON {{BUSINESS_TABLE_PREFIX}}ticket(workspace_id, channel);
CREATE INDEX IF NOT EXISTS idx_business_ticket_company ON {{BUSINESS_TABLE_PREFIX}}ticket(workspace_id, company_id);
CREATE INDEX IF NOT EXISTS idx_business_ticket_contact ON {{BUSINESS_TABLE_PREFIX}}ticket(workspace_id, contact_id);
