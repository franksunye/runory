-- runory.work-order v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}work_order (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT DEFAULT 'medium',
  company_id TEXT,
  contact_id TEXT,
  service_site_id TEXT,
  asset_id TEXT,
  assigned_to TEXT,
  requested_at TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  completed_at TEXT,
  sla_due_at TEXT,
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_work_order_workspace ON {{BUSINESS_TABLE_PREFIX}}work_order(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_work_order_status ON {{BUSINESS_TABLE_PREFIX}}work_order(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_work_order_priority ON {{BUSINESS_TABLE_PREFIX}}work_order(workspace_id, priority);
CREATE INDEX IF NOT EXISTS idx_business_work_order_company ON {{BUSINESS_TABLE_PREFIX}}work_order(workspace_id, company_id);
CREATE INDEX IF NOT EXISTS idx_business_work_order_assigned ON {{BUSINESS_TABLE_PREFIX}}work_order(workspace_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_business_work_order_site ON {{BUSINESS_TABLE_PREFIX}}work_order(workspace_id, service_site_id);
