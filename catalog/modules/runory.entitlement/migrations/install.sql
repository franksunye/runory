-- runory.entitlement v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}entitlement (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entitlement_number TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  entitlement_type TEXT NOT NULL DEFAULT 'support_hours',
  total_value INTEGER DEFAULT 0,
  consumed_value INTEGER DEFAULT 0,
  remaining_value INTEGER,
  unit TEXT DEFAULT 'hours',
  start_date TEXT,
  end_date TEXT,
  company_id TEXT,
  contact_id TEXT,
  product_service_id TEXT,
  asset_id TEXT,
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_entitlement_workspace ON {{BUSINESS_TABLE_PREFIX}}entitlement(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_entitlement_status ON {{BUSINESS_TABLE_PREFIX}}entitlement(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_entitlement_type ON {{BUSINESS_TABLE_PREFIX}}entitlement(workspace_id, entitlement_type);
CREATE INDEX IF NOT EXISTS idx_business_entitlement_company ON {{BUSINESS_TABLE_PREFIX}}entitlement(workspace_id, company_id);
