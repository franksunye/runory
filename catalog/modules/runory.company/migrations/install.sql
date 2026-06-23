-- runory.company v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}company (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  website TEXT,
  phone TEXT,
  industry TEXT,
  size TEXT,
  source TEXT,
  owner TEXT,
  lifecycle_stage TEXT NOT NULL DEFAULT 'lead',
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_company_workspace ON {{BUSINESS_TABLE_PREFIX}}company(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_company_stage ON {{BUSINESS_TABLE_PREFIX}}company(workspace_id, lifecycle_stage);
