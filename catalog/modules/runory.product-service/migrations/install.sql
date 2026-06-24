-- runory.product-service v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}product_service (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'service',
  sku TEXT,
  description TEXT,
  unit TEXT,
  default_price REAL,
  currency TEXT DEFAULT 'CNY',
  active INTEGER NOT NULL DEFAULT 1,
  tax_category TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_product_service_workspace ON {{BUSINESS_TABLE_PREFIX}}product_service(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_product_service_type ON {{BUSINESS_TABLE_PREFIX}}product_service(workspace_id, type);
CREATE INDEX IF NOT EXISTS idx_business_product_service_active ON {{BUSINESS_TABLE_PREFIX}}product_service(workspace_id, active);
CREATE INDEX IF NOT EXISTS idx_business_product_service_sku ON {{BUSINESS_TABLE_PREFIX}}product_service(workspace_id, sku);
