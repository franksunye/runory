-- runory.consent v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}consent (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'granted',
  granted_at TEXT,
  withdrawn_at TEXT,
  source TEXT,
  submission_id TEXT,
  policy_version TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_consent_workspace ON {{BUSINESS_TABLE_PREFIX}}consent(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_consent_status ON {{BUSINESS_TABLE_PREFIX}}consent(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_consent_contact ON {{BUSINESS_TABLE_PREFIX}}consent(workspace_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_business_consent_purpose ON {{BUSINESS_TABLE_PREFIX}}consent(workspace_id, purpose);
