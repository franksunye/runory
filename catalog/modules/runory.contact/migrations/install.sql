-- runory.contact v2.0.0 install migration
-- Breaking change: customer_id (required, FK to customer) replaced with primary_company_id (optional)
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}contact (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  role TEXT,
  primary_company_id TEXT,
  source TEXT,
  owner TEXT,
  lifecycle_stage TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_contact_workspace ON {{BUSINESS_TABLE_PREFIX}}contact(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contact_company ON {{BUSINESS_TABLE_PREFIX}}contact(workspace_id, primary_company_id);
