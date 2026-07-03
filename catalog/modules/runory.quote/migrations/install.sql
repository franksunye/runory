-- runory.quote v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}quote (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  quote_number TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  company_id TEXT,
  contact_id TEXT,
  deal_id TEXT,
  work_order_id TEXT,
  service_site_id TEXT,
  asset_id TEXT,
  currency TEXT NOT NULL DEFAULT 'CNY',
  subtotal REAL,
  discount_total REAL,
  tax_total REAL,
  grand_total REAL,
  valid_until TEXT,
  owner TEXT,
  terms TEXT,
  notes TEXT,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  root_quote_id TEXT,
  previous_version_id TEXT,
  revision_number INTEGER NOT NULL DEFAULT 0,
  price_book_id TEXT,
  approved_at TEXT,
  accepted_at TEXT,
  rejected_reason TEXT,
  withdrawn_at TEXT,
  snapshot_hash TEXT,
  locked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_quote_workspace ON {{BUSINESS_TABLE_PREFIX}}quote(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_quote_status ON {{BUSINESS_TABLE_PREFIX}}quote(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_quote_company ON {{BUSINESS_TABLE_PREFIX}}quote(workspace_id, company_id);
CREATE INDEX IF NOT EXISTS idx_business_quote_deal ON {{BUSINESS_TABLE_PREFIX}}quote(workspace_id, deal_id);
CREATE INDEX IF NOT EXISTS idx_business_quote_work_order ON {{BUSINESS_TABLE_PREFIX}}quote(workspace_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_business_quote_valid_until ON {{BUSINESS_TABLE_PREFIX}}quote(workspace_id, valid_until);
CREATE INDEX IF NOT EXISTS idx_business_quote_root_quote ON {{BUSINESS_TABLE_PREFIX}}quote(workspace_id, root_quote_id);

CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}quote_line (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  product_service_id TEXT,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  discount_amount REAL,
  tax_amount REAL,
  line_total REAL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_quote_line_workspace ON {{BUSINESS_TABLE_PREFIX}}quote_line(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_quote_line_quote ON {{BUSINESS_TABLE_PREFIX}}quote_line(workspace_id, quote_id);
CREATE INDEX IF NOT EXISTS idx_business_quote_line_product ON {{BUSINESS_TABLE_PREFIX}}quote_line(workspace_id, product_service_id);
