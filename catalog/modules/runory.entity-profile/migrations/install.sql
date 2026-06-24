-- runory.entity-profile v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}entity_profile (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'topic',
  target_object TEXT,
  target_id TEXT,
  company_id TEXT,
  product_service_id TEXT,
  landing_page_id TEXT,
  description TEXT,
  keywords_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  locale TEXT DEFAULT 'zh-CN',
  owner TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_entity_profile_workspace ON {{BUSINESS_TABLE_PREFIX}}entity_profile(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_entity_profile_status ON {{BUSINESS_TABLE_PREFIX}}entity_profile(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_entity_profile_type ON {{BUSINESS_TABLE_PREFIX}}entity_profile(workspace_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_business_entity_profile_company ON {{BUSINESS_TABLE_PREFIX}}entity_profile(workspace_id, company_id);
