-- runory.deal v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}deal (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  amount REAL,
  currency TEXT DEFAULT 'CNY',
  expected_close_date TEXT,
  probability REAL,
  company_id TEXT,
  primary_contact_id TEXT,
  owner TEXT,
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_deal_workspace ON {{BUSINESS_TABLE_PREFIX}}deal(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_deal_stage ON {{BUSINESS_TABLE_PREFIX}}deal(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_business_deal_company ON {{BUSINESS_TABLE_PREFIX}}deal(workspace_id, company_id);
