-- runory.service-site v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}service_site (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  company_id TEXT,
  primary_contact_id TEXT,
  address TEXT NOT NULL,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  access_notes TEXT,
  service_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_service_site_workspace ON {{BUSINESS_TABLE_PREFIX}}service_site(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_service_site_status ON {{BUSINESS_TABLE_PREFIX}}service_site(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_service_site_company ON {{BUSINESS_TABLE_PREFIX}}service_site(workspace_id, company_id);
