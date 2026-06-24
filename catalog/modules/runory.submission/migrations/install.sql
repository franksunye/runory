-- runory.submission v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}submission (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  landing_page_id TEXT,
  campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  payload_json TEXT,
  contact_id TEXT,
  company_id TEXT,
  deal_id TEXT,
  source_url TEXT,
  referrer TEXT,
  ip_address TEXT,
  user_agent TEXT,
  consent_given INTEGER NOT NULL DEFAULT 0,
  consent_text TEXT,
  processed_by TEXT,
  processed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_submission_workspace ON {{BUSINESS_TABLE_PREFIX}}submission(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_submission_status ON {{BUSINESS_TABLE_PREFIX}}submission(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_submission_form ON {{BUSINESS_TABLE_PREFIX}}submission(workspace_id, form_id);
CREATE INDEX IF NOT EXISTS idx_business_submission_campaign ON {{BUSINESS_TABLE_PREFIX}}submission(workspace_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_business_submission_contact ON {{BUSINESS_TABLE_PREFIX}}submission(workspace_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_business_submission_company ON {{BUSINESS_TABLE_PREFIX}}submission(workspace_id, company_id);
