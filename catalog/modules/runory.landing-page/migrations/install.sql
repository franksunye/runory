-- runory.landing-page v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}landing_page (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  headline TEXT,
  subheadline TEXT,
  body_html TEXT,
  cta_text TEXT DEFAULT 'Apply Now',
  form_id TEXT,
  campaign_id TEXT,
  meta_description TEXT,
  published_at TEXT,
  owner TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_landing_page_workspace ON {{BUSINESS_TABLE_PREFIX}}landing_page(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_landing_page_status ON {{BUSINESS_TABLE_PREFIX}}landing_page(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_landing_page_slug ON {{BUSINESS_TABLE_PREFIX}}landing_page(workspace_id, slug);
