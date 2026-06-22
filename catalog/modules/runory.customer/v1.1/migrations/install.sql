CREATE TABLE IF NOT EXISTS {{BUSINESS_TABLE_PREFIX}}customer (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  industry TEXT,
  website TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_customer_workspace ON {{BUSINESS_TABLE_PREFIX}}customer(workspace_id);
