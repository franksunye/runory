-- runory.quote-approval v1.0.0 install migration
CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}quote_approval (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  reviewed_by TEXT,
  requested_at TEXT,
  reviewed_at TEXT,
  decision_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_quote_approval_workspace ON {{BUSINESS_TABLE_PREFIX}}quote_approval(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_quote_approval_status ON {{BUSINESS_TABLE_PREFIX}}quote_approval(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_quote_approval_quote ON {{BUSINESS_TABLE_PREFIX}}quote_approval(workspace_id, quote_id);
