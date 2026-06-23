-- runory.asset v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}asset (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  serial_number TEXT,
  asset_type TEXT,
  company_id TEXT,
  service_site_id TEXT,
  installed_at TEXT,
  warranty_until TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_asset_workspace ON {{BUSINESS_TABLE_PREFIX}}asset(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_asset_status ON {{BUSINESS_TABLE_PREFIX}}asset(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_asset_company ON {{BUSINESS_TABLE_PREFIX}}asset(workspace_id, company_id);
CREATE INDEX IF NOT EXISTS idx_business_asset_site ON {{BUSINESS_TABLE_PREFIX}}asset(workspace_id, service_site_id);
