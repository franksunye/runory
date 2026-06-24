-- runory.warranty v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}warranty (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  warranty_number TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  warranty_type TEXT NOT NULL DEFAULT 'standard',
  start_date TEXT,
  end_date TEXT,
  company_id TEXT,
  contact_id TEXT,
  product_service_id TEXT,
  asset_id TEXT,
  quote_id TEXT,
  terms TEXT,
  coverage_json TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_warranty_workspace ON {{BUSINESS_TABLE_PREFIX}}warranty(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_warranty_status ON {{BUSINESS_TABLE_PREFIX}}warranty(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_warranty_type ON {{BUSINESS_TABLE_PREFIX}}warranty(workspace_id, warranty_type);
CREATE INDEX IF NOT EXISTS idx_business_warranty_company ON {{BUSINESS_TABLE_PREFIX}}warranty(workspace_id, company_id);
CREATE INDEX IF NOT EXISTS idx_business_warranty_asset ON {{BUSINESS_TABLE_PREFIX}}warranty(workspace_id, asset_id);
