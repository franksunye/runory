-- runory.maintenance-plan v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}maintenance_plan (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_number TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  plan_type TEXT NOT NULL DEFAULT 'recurring',
  frequency TEXT DEFAULT 'quarterly',
  start_date TEXT,
  end_date TEXT,
  next_visit_date TEXT,
  total_visits INTEGER DEFAULT 0,
  completed_visits INTEGER DEFAULT 0,
  company_id TEXT,
  contact_id TEXT,
  asset_id TEXT,
  task_id TEXT,
  work_order_id TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_maintenance_plan_workspace ON {{BUSINESS_TABLE_PREFIX}}maintenance_plan(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_maintenance_plan_status ON {{BUSINESS_TABLE_PREFIX}}maintenance_plan(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_maintenance_plan_type ON {{BUSINESS_TABLE_PREFIX}}maintenance_plan(workspace_id, plan_type);
CREATE INDEX IF NOT EXISTS idx_business_maintenance_plan_company ON {{BUSINESS_TABLE_PREFIX}}maintenance_plan(workspace_id, company_id);
CREATE INDEX IF NOT EXISTS idx_business_maintenance_plan_next_visit ON {{BUSINESS_TABLE_PREFIX}}maintenance_plan(workspace_id, next_visit_date);
