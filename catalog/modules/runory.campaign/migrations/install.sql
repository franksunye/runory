-- runory.campaign v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}campaign (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  source TEXT,
  medium TEXT,
  start_date TEXT,
  end_date TEXT,
  budget REAL,
  currency TEXT DEFAULT 'CNY',
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_campaign_workspace ON {{BUSINESS_TABLE_PREFIX}}campaign(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_campaign_status ON {{BUSINESS_TABLE_PREFIX}}campaign(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_campaign_source ON {{BUSINESS_TABLE_PREFIX}}campaign(workspace_id, source);
